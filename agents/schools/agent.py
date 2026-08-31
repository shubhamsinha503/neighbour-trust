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
from agents.schools.sources import udise as udise_src

log = logging.getLogger(__name__)

# Radii the payload reports. 2 km is roughly "school run on foot or a short
# auto ride"; 5 km is "realistic daily commute in Indian city traffic".
CLOSE_RADIUS_KM = 2.0
WIDE_RADIUS_KM = 5.0

# How many individual schools the card lists. Enough to be useful, few enough
# that nobody mistakes it for a directory.
NEAREST_COUNT = 6

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


def assess_confidence(vintage: datetime, *, has_pass_rates: bool, now: Optional[datetime] = None) -> Confidence:
    """Confidence for a schools envelope.

    Deliberately cannot return HIGH without pass rates, regardless of how fresh
    the UDISE data is — the strategy doc's rule requires both, and enrolment
    counts alone do not describe school quality no matter what year they are from.
    """
    now = now or datetime.now(timezone.utc)
    age = now - vintage

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


# ---------------------------------------------------------------------------
# Phase 2 — aggregate per locality
# ---------------------------------------------------------------------------


def build_envelope_for_locality(
    conn, locality: dict[str, Any], *, vintage: datetime, now: Optional[datetime] = None
) -> LocalityResult:
    now = now or datetime.now(timezone.utc)
    lat, lon, slug = locality["lat"], locality["lon"], locality["slug"]

    wide = db.schools_near(conn, lat=lat, lon=lon, radius_km=WIDE_RADIUS_KM)
    if not wide:
        # A real answer, not an error. Some localities genuinely have no UDISE
        # school within 5 km, and saying so is the product's whole premise.
        return LocalityResult(
            slug=slug,
            ok=False,
            reason=f"no UDISE school recorded within {WIDE_RADIUS_KM:g} km",
        )

    close = [s for s in wide if s["distance_km"] <= CLOSE_RADIUS_KM]

    # Refuse to publish a count we have measured to be wrong — see
    # agents/schools/coverage.py for the Indiranagar 61-vs-0 comparison that
    # motivates this.
    gap = coverage.insufficient_coverage_reason(
        within_2km=len(close), within_5km=len(wide)
    )
    if gap is not None:
        return LocalityResult(slug=slug, ok=False, reason=gap)

    # Medians over the close set where there is one, else the wide set — a
    # locality on the edge of the city shouldn't report nothing just because its
    # schools are 3 km out.
    basis = close or wide

    boards = sorted(
        {
            board
            for school in basis
            for board in (school["board_secondary"], school["board_higher_sec"])
            if board
        }
    )

    government = sum(
        1 for s in basis if (s["management"] or "").strip().lower() in GOVERNMENT_MANAGEMENTS
    )

    payload = SchoolsAreaPayload(
        schools_within_2km=len(close),
        schools_within_5km=len(wide),
        median_pupil_teacher_ratio=scoring.median_or_none([s["pupil_teacher_ratio"] for s in basis]),
        median_proxy_score=scoring.median_or_none([s["proxy_score"] for s in basis]),
        government_share_pct=round(100 * government / len(basis), 1) if basis else None,
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
            for s in wide[:NEAREST_COUNT]
        ],
        sources_used=[udise_src.SOURCE_NAME],
    )

    envelope = DataEnvelope(
        category=Category.SCHOOLS,
        source_name=udise_src.SOURCE_NAME,
        source_url=udise_src.SOURCE_URL,
        fetched_at=now,
        # The gap between these two is the entire story for this category: we
        # fetched today, the data is from 2022.
        data_vintage=vintage,
        h3_cell=locality["h3_cell"],
        confidence=assess_confidence(vintage, has_pass_rates=False, now=now),
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
