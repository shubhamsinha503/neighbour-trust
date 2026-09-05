"""Connectivity agent — what is built around a locality, and what that is worth.

Fills the infrastructure category with what exists today rather than what is
coming. docs/strategy.md scopes this category to RERA registrations and upcoming
metro and highway plans; that remains the ambition and is a
scraping-or-partnership problem. This is the checkable half, and the card names
which half it is showing.

Two guards carry most of the honesty here.

**Empty is not zero.** A locality where OpenStreetMap has mapped nothing is
reported as having no data, not as having no amenities. Manesar returned zero
industrial sites on the first run — for one of India's largest industrial
estates — because OSM coverage in outer Gurugram is thin. Scoring that as
"nothing nearby" would have rewarded the locality with the worst map.

**Industry counts against.** Every other signal here is something a buyer wants
close. Industrial land is the one they want far, and no Indian source publishes
its distance from housing at all.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from neighbour_trust_schema.envelope import Category, Confidence, DataEnvelope

from agents.common import db
from agents.infrastructure.sources import osm_amenities as osm

log = logging.getLogger(__name__)

# Below this many mapped features of any kind, the locality is treated as
# unmapped rather than as empty. Chosen from the observed spread: covered
# localities returned 80-250 features, Manesar returned zero.
MIN_FEATURES_FOR_DATA = 8

# Distance bands, in km, for the nearest of each kind. These are judgements
# about how people actually move in these two cities rather than measurements.
METRO_EXCELLENT, METRO_POOR = 1.0, 3.0
HOSPITAL_EXCELLENT, HOSPITAL_POOR = 1.0, 3.0
# Industrial land closer than this is a live consideration: lorry traffic,
# particulates, night-time noise.
INDUSTRY_CLOSE, INDUSTRY_FAR = 1.0, 3.0


@dataclass
class LocalityResult:
    slug: str
    ok: bool
    reason: Optional[str] = None
    envelope: Optional[DataEnvelope] = None
    score: Optional[int] = None


def _band(value: Optional[float], best: float, worst: float) -> float:
    """1.0 at `best` or nearer, 0.0 at `worst` or further, linear between.

    Returns 0.0 for None, which is the right reading for "no metro within the
    search radius" — the absence is the finding.
    """
    if value is None:
        return 0.0
    if value <= best:
        return 1.0
    if value >= worst:
        return 0.0
    return (worst - value) / (worst - best)


def score_amenities(a: osm.Amenities) -> int:
    """0-100 for what is around this locality.

    Weighted toward the things people say they move for: getting to work,
    reaching a hospital, and somewhere for children to play. Counts are capped
    quickly — the difference between two hospitals and thirty is mostly a
    difference in how densely a district was mapped, while the difference between
    zero and two is real.
    """
    transit = _band(a.nearest_metro_km, METRO_EXCELLENT, METRO_POOR)
    healthcare = _band(a.nearest_hospital_km, HOSPITAL_EXCELLENT, HOSPITAL_POOR)
    # Presence of several is worth something beyond the nearest one, but it
    # saturates fast to avoid rewarding map density.
    depth = min(a.hospitals + a.clinics, 10) / 10
    green = min(a.parks, 12) / 12
    shops = min(a.markets, 8) / 8

    score = 100 * (
        0.34 * transit
        + 0.24 * healthcare
        + 0.10 * depth
        + 0.20 * green
        + 0.12 * shops
    )

    # Industrial land nearby is the one signal that subtracts. Full penalty
    # inside a kilometre, none beyond three.
    if a.industrial_sites:
        proximity = _band(a.nearest_industry_km, INDUSTRY_CLOSE, INDUSTRY_FAR)
        score -= 18 * proximity

    return max(5, min(100, round(score)))


def describe(a: osm.Amenities) -> str:
    """One line for the card, leading with whatever is most decision-relevant."""
    parts: list[str] = []

    if a.nearest_metro_km is not None:
        name = (a.names.get("metro_rail") or [None])[0]
        parts.append(
            f"nearest station {a.nearest_metro_km} km"
            + (f" ({name})" if name else "")
        )
    else:
        parts.append("no rail or metro station within 2.5 km")

    if a.nearest_hospital_km is not None:
        parts.append(f"hospital {a.nearest_hospital_km} km")
    if a.parks:
        parts.append(f"{a.parks} parks")

    line = " · ".join(parts)

    if a.industrial_sites and a.nearest_industry_km is not None:
        if a.nearest_industry_km <= INDUSTRY_CLOSE:
            line += f" · industrial land {a.nearest_industry_km} km away"
    return line


def build_envelope(
    conn, locality: dict[str, Any], *, client: osm.OsmAmenityClient,
    now: Optional[datetime] = None,
) -> LocalityResult:
    now = now or datetime.now(timezone.utc)
    slug = locality["slug"]

    try:
        found = client.around(locality["lat"], locality["lon"])
    except Exception as exc:
        return LocalityResult(slug=slug, ok=False, reason=f"Overpass failed: {exc}")

    total = (
        found.metro_rail + found.hospitals + found.clinics
        + found.parks + found.markets + found.industrial_sites
    )
    if total < MIN_FEATURES_FOR_DATA:
        # Not "nothing here" — "nothing mapped here". Manesar returned zero
        # industrial sites while sitting beside one of India's largest
        # industrial estates.
        return LocalityResult(
            slug=slug, ok=False,
            reason=f"OpenStreetMap has only {total} mapped features here — too "
                   f"few to describe the area rather than the map",
        )

    score = score_amenities(found)
    payload = {
        "metro_rail_stations": found.metro_rail,
        "nearest_station_km": found.nearest_metro_km,
        "hospitals": found.hospitals,
        "clinics": found.clinics,
        "nearest_hospital_km": found.nearest_hospital_km,
        "parks": found.parks,
        "nearest_park_km": found.nearest_park_km,
        "markets": found.markets,
        "industrial_sites": found.industrial_sites,
        "nearest_industry_km": found.nearest_industry_km,
        "named": found.names,
        "connectivity_score": score,
        "summary": describe(found),
        "scope_note": (
            "What is already built nearby, from OpenStreetMap. Not RERA "
            "registrations or upcoming projects — those need a different source."
        ),
        "sources_used": [osm.SOURCE_NAME],
    }

    envelope = DataEnvelope(
        category=Category.INFRASTRUCTURE,
        source_name=osm.SOURCE_NAME,
        source_url=osm.SOURCE_URL,
        fetched_at=now,
        # OpenStreetMap is continuously edited, so what we fetched today is
        # today's map. Unlike UDISE there is no snapshot date to inherit.
        data_vintage=now,
        h3_cell=locality["h3_cell"],
        # Community-maintained rather than official. Coverage is uneven across
        # Indian cities and the tag says so.
        confidence=Confidence.COMMUNITY_ESTIMATED,
        payload=payload,
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
    return LocalityResult(slug=slug, ok=True, envelope=envelope, score=score)
