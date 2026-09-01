"""Schools agent — ingest UDISE records, then aggregate them per locality.

Two-phase on purpose, and this is the structural difference from air quality:

  * Air quality is *one measurement per locality*. Fetch, compute, write envelope.
  * Schools is *many records per locality*. So phase one loads schools into their
    own table keyed by UDISE code, and phase two computes each locality's
    envelope from whatever is in that table.

Splitting them means the radius, the scoring weights, and the "nearest N" cutoff
can all change without re-fetching ~3,000 rows from upstream, and a locality
added next month gets an envelope from data already on disk.

Confidence, and why it is what it is:

docs/strategy.md sets the rule — "High only when both UDISE infra data and a
board pass rate exist and are under 18 months old; Medium when only UDISE fields
exist; Low when the score is extrapolated". Against the real source:

  * There are no board pass rates in this dataset at all. That alone rules out High.
  * The snapshot is from January 2022 — roughly 4.5 years old. That is far past
    the 18-month line the rule draws.

So schools ships at **Low** everywhere today, and the card says so in words
rather than only as a coloured dot. If a fresher UDISE cycle is published, the
vintage is read from resource metadata and this lifts to Medium on its own.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from neighbour_trust_schema.envelope import (
    Category,
    Confidence,
    DataEnvelope,
    SchoolsAreaPayload,
    SchoolsPayload,
)

from agents.common import db
from agents.common.geo import cell_for
from agents.schools import coverage, scoring
from agents.schools.sources import osm as osm_src
from agents.schools.sources import udise as udise_src

log = logging.getLogger(__name__)

# Radii the payload reports. 2 km is roughly "school run on foot or a short
# auto ride"; 5 km is "realistic daily commute in Indian city traffic".
CLOSE_RADIUS_KM = 2.0
WIDE_RADIUS_KM = 5.0

# How many individual schools the card lists. Enough to be useful, few enough
# that nobody mistakes it for a directory.
NEAREST_COUNT = 6

# Below this many schools with staffing figures, no median is published. A
# "median pupil-teacher ratio" derived from one school is not a median, and
# printing it next to a count of 61 nearby schools implies we know far more than
# we do. The count itself is still shown, so the sparseness stays visible.
MIN_STAFFING_SAMPLE = 3

# Past this, UDISE data is too old to call anything but Low — see the module
# docstring. Kept as a named constant so the rule is visible rather than implied.
MEDIUM_CONFIDENCE_MAX_AGE = timedelta(days=548)  # ~18 months, per docs/strategy.md

GOVERNMENT_MANAGEMENTS = (
    "department of education",
    "local body",
    "tribal welfare department",
    "other govt. managed schools",
    "kendriya vidyalaya",
    "jawahar navodaya vidyalaya",
    "govt. aided",
    "government aided",
)


@dataclass
class IngestResult:
    city: str
    schools_loaded: int
    data_vintage: datetime


@dataclass
class LocalityResult:
    slug: str
    ok: bool
    reason: Optional[str] = None
    envelope: Optional[DataEnvelope] = None
    schools_within_2km: int = 0


def assess_confidence(
    vintage: datetime,
    *,
    has_pass_rates: bool,
    has_staffing: bool = True,
    now: Optional[datetime] = None,
) -> Confidence:
    """Confidence for a schools envelope.

    Deliberately cannot return HIGH without pass rates, regardless of how fresh
    the UDISE data is — the strategy doc's rule requires both, and enrolment
    counts alone do not describe school quality no matter what year they are from.

    `has_staffing` exists because keying confidence on recency alone inverted the
    ranking. A locality matched to UDISE inherits that 2022 snapshot's vintage and
    scored LOW; a locality UDISE has never heard of kept OpenStreetMap's current
    date and scored MEDIUM. Banashankari, with 116 schools of staffing data and a
    known pupil-teacher ratio, was rated *below* Banaswadi, which had nothing but
    a count of buildings.

    Recency is not the only thing confidence means. Knowing a locality has 32
    schools and nothing else about any of them is thin, however freshly the
    building was mapped, so presence-only evidence is LOW as well.
    """
    now = now or datetime.now(timezone.utc)
    age = now - vintage

    if not has_staffing:
        return Confidence.LOW
    if age > MEDIUM_CONFIDENCE_MAX_AGE:
        return Confidence.LOW
    if not has_pass_rates:
        return Confidence.MEDIUM
    return Confidence.HIGH


# ---------------------------------------------------------------------------
# Phase 1 — load schools
# ---------------------------------------------------------------------------


def ingest_city(conn, client: udise_src.UdiseClient, *, city: str) -> IngestResult:
    """Load every UDISE school for a city into the school table."""
    vintage = client.data_vintage()
    loaded = 0

    for record in client.schools_for_city(city):
        ptr = scoring.pupil_teacher_ratio(record["total_students"], record["total_teachers"])
        spr = scoring.students_per_room(record["total_students"], record["class_rooms"])

        db.upsert_school(
            conn,
            {
                **record,
                "source": "udise",
                "external_id": record["udise_code"],
                "h3_cell": cell_for(record["lat"], record["lon"]),
                "pupil_teacher_ratio": ptr,
                "students_per_room": spr,
                "proxy_score": scoring.proxy_score(ptr, spr),
                "data_vintage": vintage,
                "source_name": udise_src.SOURCE_NAME,
            },
        )
        loaded += 1

    log.info("%s: loaded %d schools (vintage %s)", city, loaded, vintage.date())
    return IngestResult(city=city, schools_loaded=loaded, data_vintage=vintage)


def ingest_city_osm(conn, client: osm_src.OsmSchoolsClient, *, city: str) -> IngestResult:
    """Load OSM school locations for a city.

    OSM is the presence source: it answers "is there a school here", which UDISE
    demonstrably fails to answer in Bengaluru. It carries no staffing or
    enrolment data, so every such field on these rows stays NULL — deliberately,
    since a zero would read as "a school with no teachers".

    Vintage is now(): OSM is continuously edited, so the data is as current as the
    moment it was fetched. That is the opposite of UDISE's frozen 2022 snapshot,
    and the reason the payload reports the two vintages separately.
    """
    vintage = datetime.now(timezone.utc)
    loaded = 0

    for record in client.schools_for_city(city):
        db.upsert_school(
            conn,
            {
                **record,
                "source": "osm",
                "udise_code": None,
                "state": None,
                "district": city,
                "h3_cell": cell_for(record["lat"], record["lon"]),
                "pupil_teacher_ratio": None,
                "students_per_room": None,
                "proxy_score": None,
                "data_vintage": vintage,
                "source_name": osm_src.SOURCE_NAME,
            },
        )
        loaded += 1

    log.info("%s: loaded %d OSM schools", city, loaded)
    return IngestResult(city=city, schools_loaded=loaded, data_vintage=vintage)


# ---------------------------------------------------------------------------
# Phase 2 — aggregate per locality
# ---------------------------------------------------------------------------


def build_envelope_for_locality(
    conn, locality: dict[str, Any], *, vintage: datetime, now: Optional[datetime] = None
) -> LocalityResult:
    """Build one locality's schools envelope from whatever is already stored.

    Presence and staffing come from different sources and are kept apart the
    whole way through:

      * **Presence** (how many schools, what they are called, how far) prefers
        OpenStreetMap, because UDISE's Bengaluru coordinates are missing schools
        that plainly exist — 61 vs 0 within 2 km of Indiranagar.
      * **Staffing** (pupil-teacher ratio, the proxy score) can only come from
        UDISE, which is the only source carrying those numbers at all.

    They are never blended into one figure. The payload reports the count, the
    smaller number of schools that have staffing data, and both vintages, so the
    card can say "61 schools nearby; staffing known for 12 of them, as of 2022"
    rather than implying we know 61 schools' worth of detail.
    """
    now = now or datetime.now(timezone.utc)
    lat, lon, slug = locality["lat"], locality["lon"], locality["slug"]

    osm_wide = db.schools_near(conn, lat=lat, lon=lon, radius_km=WIDE_RADIUS_KM, source="osm")
    udise_wide = db.schools_near(conn, lat=lat, lon=lon, radius_km=WIDE_RADIUS_KM, source="udise")

    # Presence from whichever source actually sees this neighbourhood. OSM wins
    # ties because it is continuously edited; UDISE is a frozen 2022 snapshot.
    if len(osm_wide) >= len(udise_wide):
        presence, presence_source = osm_wide, osm_src.SOURCE_NAME
    else:
        presence, presence_source = udise_wide, udise_src.SOURCE_NAME

    if not presence:
        return LocalityResult(
            slug=slug,
            ok=False,
            reason=f"no school recorded within {WIDE_RADIUS_KM:g} km by either source",
        )

    close = [s for s in presence if s["distance_km"] <= CLOSE_RADIUS_KM]

    # The guard still applies, but now against the best available presence count
    # rather than UDISE alone — which is what lets Bengaluru publish again.
    gap = coverage.insufficient_coverage_reason(
        within_2km=len(close), within_5km=len(presence)
    )
    if gap is not None:
        return LocalityResult(slug=slug, ok=False, reason=gap)

    # Staffing is always UDISE, over the tight radius where there is one.
    staffing_close = [s for s in udise_wide if s["distance_km"] <= CLOSE_RADIUS_KM]
    staffing = [s for s in (staffing_close or udise_wide) if s["pupil_teacher_ratio"] is not None]

    boards = sorted(
        {
            board
            for school in presence
            for board in (school["board_secondary"], school["board_higher_sec"])
            if board
        }
    )

    government = sum(
        1 for s in presence if (s["management"] or "").strip().lower() in GOVERNMENT_MANAGEMENTS
    )

    payload = SchoolsAreaPayload(
        schools_within_2km=len(close),
        schools_within_5km=len(presence),
        presence_source=presence_source,
        schools_with_staffing_data=len(staffing),
        median_pupil_teacher_ratio=(
            scoring.median_or_none([s["pupil_teacher_ratio"] for s in staffing])
            if len(staffing) >= MIN_STAFFING_SAMPLE
            else None
        ),
        median_proxy_score=(
            scoring.median_or_none([s["proxy_score"] for s in staffing])
            if len(staffing) >= MIN_STAFFING_SAMPLE
            else None
        ),
        government_share_pct=(
            round(100 * government / len(presence), 1) if government else None
        ),
        staffing_vintage=vintage if staffing else None,
        boards_available=boards,
        nearest_schools=[
            SchoolsPayload(
                name=s["name"],
                board=s["board_secondary"] or s["board_higher_sec"],
                distance_km=round(s["distance_km"], 2),
                pupil_teacher_ratio=s["pupil_teacher_ratio"],
                infra_score=scoring.infra_score(s["students_per_room"], None),
                pass_rate=None,  # never available from UDISE — see SchoolsPayload
                udise_code=s["udise_code"],
                management=s["management"],
                school_category=s["school_category"],
                total_students=s["total_students"],
                total_teachers=s["total_teachers"],
                proxy_score=s["proxy_score"],
            )
            for s in presence[:NEAREST_COUNT]
        ],
        sources_used=sorted({presence_source, *([udise_src.SOURCE_NAME] if staffing else [])}),
    )

    envelope = DataEnvelope(
        category=Category.SCHOOLS,
        source_name=presence_source,
        source_url=(
            osm_src.SOURCE_URL if presence_source == osm_src.SOURCE_NAME else udise_src.SOURCE_URL
        ),
        fetched_at=now,
        # The envelope's vintage is the *oldest* thing it leans on. If any staffing
        # figure is shown, that 2022 snapshot is the honest answer for the payload
        # as a whole, even when the school list itself is current.
        data_vintage=vintage if staffing else now,
        h3_cell=locality["h3_cell"],
        confidence=assess_confidence(
            vintage if staffing else now,
            has_pass_rates=False,
            has_staffing=bool(staffing),
            now=now,
        ),
        payload=payload.model_dump(mode="json"),
    )

    db.upsert_envelope(
        conn,
        category=envelope.category.value,
        source_name=envelope.source_name,
        source_url=envelope.source_url,
        fetched_at=envelope.fetched_at,
        data_vintage=envelope.data_vintage,
        h3_cell=envelope.h3_cell,
        confidence=envelope.confidence.value,
        payload=envelope.payload,
    )

    return LocalityResult(
        slug=slug, ok=True, envelope=envelope, schools_within_2km=len(close)
    )
