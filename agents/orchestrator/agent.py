"""The locality report agent.

Sits above the category agents, per docs/strategy.md: "callable with a location,
it decides which sub-agents to call, merges their envelopes into one report keyed
by that H3 cell, computes the weighted composite Neighbourhood Trust Score, and
explicitly surfaces disagreements rather than silently averaging them away".

One difference from the doc worth naming. The doc describes the orchestrator
*calling* sub-agents on demand. This one reads their stored envelopes instead,
because every category agent already runs on a schedule and writes to
`data_envelope`. Fetching on request would make page loads depend on whether
CPCB's feed is up this second — which, today, it is not. Reading stored envelopes
with read-time staleness rules (agents/common/freshness.py) gives the same answer
without putting an upstream outage on the critical path of a page view.

The report is assembled per request and never stored. Weights, copy and
reconciliation rules change often; a stored composite would need a backfill every
time, and would go stale against the envelopes it was derived from.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from neighbour_trust_schema.envelope import Confidence

from agents.common import db, freshness
from agents.orchestrator import reconcile, score as score_mod

log = logging.getLogger(__name__)

# Categories the report shows, in the order the mockup's grid uses.
REPORT_CATEGORIES = (
    "schools",
    "crime",
    "air_quality",
    "water",
    "power",
    "infrastructure",
)

# Human labels, matching the mockup.
CATEGORY_LABELS = {
    "schools": "Schools",
    "crime": "Safety",
    "air_quality": "Air quality",
    "water": "Water",
    "power": "Power",
    "infrastructure": "Infrastructure",
}


@dataclass
class LocalityReport:
    locality: dict[str, Any]
    trust_score: score_mod.TrustScore
    verdict: str
    biggest_watchout: Optional[dict[str, str]]
    disagreements: list[reconcile.Disagreement]
    categories: list[dict[str, Any]]
    sources_used: list[str]
    generated_at: datetime
    envelopes: dict[str, Any] = field(default_factory=dict)


def _load_envelopes(conn, h3_cell: str) -> dict[str, Any]:
    """Latest envelope per category, with read-time staleness applied.

    A category whose freshest envelope is too old to serve is treated as absent
    rather than stale-but-present — the same rule the individual category
    endpoints apply, so the report and the cards can never disagree about
    whether data exists.
    """
    envelopes: dict[str, Any] = {}

    for category in REPORT_CATEGORIES:
        envelope = db.latest_envelope(conn, category=category, h3_cell=h3_cell)
        if envelope is None:
            continue

        fresh = freshness.evaluate(
            category=category,
            stored_confidence=envelope["confidence"],
            data_vintage=envelope["data_vintage"],
        )
        if fresh.withhold:
            log.info("[%s] %s withheld: %s", h3_cell, category, fresh.reason)
            continue

        envelope["confidence"] = fresh.confidence.value
        envelopes[category] = envelope

    # AQICN is stored as its own envelope under the air_quality category, on the
    # US EPA scale. Pulled out separately so the reconciler can compare the two
    # without it ever being mistaken for the headline figure.
    aqicn = db.latest_envelope_by_source(
        conn, category="air_quality", h3_cell=h3_cell, source_name="AQICN"
    )
    if aqicn is not None:
        envelopes["air_quality_aqicn"] = aqicn

    return envelopes


def _verdict_sentence(trust: score_mod.TrustScore, categories: list[dict[str, Any]]) -> str:
    """The headline. Interpretation first, per the mockup's ordering."""
    if trust.score is None:
        # Must not contradict the cards below it. "Not enough data yet" was
        # appearing above three populated categories, which reads as a broken
        # page rather than a deliberate choice. What is actually missing is
        # enough *scoreable* data, and that distinction is the point.
        shown = [c for c in categories if c["available"]]
        if not shown:
            return "We have nothing on this locality yet."
        return (
            f"No overall score for this locality — {len(shown)} categories have "
            f"data, but too few of them can be scored to justify a single number. "
            f"Here is what we do know."
        )

    scored = [c for c in categories if c["counted"]]
    best = max(scored, key=lambda c: c["score"], default=None)
    worst = min(scored, key=lambda c: c["score"], default=None)

    if trust.score >= 75:
        opening = "Scores well on what we can measure here"
    elif trust.score >= 55:
        opening = "A reasonable pick on what we can measure"
    elif trust.score >= 40:
        opening = "Mixed on what we can measure"
    else:
        opening = "Struggles on what we can measure"

    parts = [opening]
    if best is not None and worst is not None and best is not worst:
        parts.append(
            f"{CATEGORY_LABELS[best['category']].lower()} is the strength, "
            f"{CATEGORY_LABELS[worst['category']].lower()} the weaker side"
        )
    elif best is not None:
        parts.append(f"driven by {CATEGORY_LABELS[best['category']].lower()}")

    sentence = " — ".join(parts) + "."
    # The coverage caveat is part of the headline, not a footnote: a score built
    # on two of six categories must never be read as a verdict on the whole
    # neighbourhood.
    return (
        f"{sentence} Based on {trust.categories_counted} of "
        f"{trust.categories_total} categories, so treat it as partial."
    )


def _biggest_watchout(categories: list[dict[str, Any]]) -> Optional[dict[str, str]]:
    """The single worst scored category, pulled out.

    Loss aversion, per docs/strategy.md: a flagged risk is weighed about twice as
    heavily as an equivalent gain and remembered better, so burying the weakest
    category as one tile among six understates how much it will actually matter.
    """
    scored = [c for c in categories if c["counted"] and c["score"] is not None]
    if not scored:
        return None

    worst = min(scored, key=lambda c: c["score"])
    if worst["score"] >= 70:
        return None  # nothing here is genuinely a watch-out

    return {
        "category": worst["category"],
        "label": CATEGORY_LABELS[worst["category"]],
        "score": worst["score"],
        "detail": worst.get("summary") or "",
    }


def _category_summary(category: str, envelope: Optional[dict[str, Any]]) -> str:
    """One line per category tile, in the mockup's style."""
    if envelope is None:
        return ""
    payload = envelope.get("payload") or {}

    if category == "air_quality":
        aqi = payload.get("current_aqi")
        if aqi is None:
            return ""
        band = (payload.get("aqi_band") or "").replace("_", " ")
        km = payload.get("nearest_station_km")

        # Two readings can carry the same number and mean very different things.
        # A full CPCB AQI from a regulatory monitor is a measurement; a PM2.5-only
        # value from a community low-cost sensor several kilometres away is an
        # indication. Since India's regulatory network went quiet on 2026-08-27,
        # every locality we serve is on the second kind — and a dozen Bengaluru
        # localities are being served by the *same* sensor, so they all show an
        # identical figure. Saying "station 8.0 km away" invites that number to be
        # read as this neighbourhood's air. Naming what produced it does not.
        if payload.get("aqi_basis") == "pm2_5_only":
            return (
                f"PM2.5 index {round(aqi)} ({band}) · low-cost sensor "
                f"{km} km away, no regulatory station reporting"
            )
        return f"AQI {round(aqi)} ({band}) · station {km} km away"

    if category == "schools":
        near = payload.get("schools_within_2km", 0)
        ptr = payload.get("median_pupil_teacher_ratio")
        if ptr is not None:
            return f"{near} schools within 2 km · median {round(ptr)}:1 pupil–teacher"
        return f"{near} schools within 2 km · staffing data for {payload.get('schools_with_staffing_data', 0)}"

    if category in ("crime", "water"):
        news = payload.get("news") or {}
        n = news.get("incidents_12m", 0)
        # Lead with what kind, not how many — the count is the part distorted by
        # how much press attention a locality gets.
        described = news.get("characterisation")
        if described:
            return described
        return f"{n} incident(s) in local press (12 months) · not scored"

    return ""


def build_report(conn, locality: dict[str, Any]) -> LocalityReport:
    now = datetime.now(timezone.utc)
    envelopes = _load_envelopes(conn, locality["h3_cell"])
    trust = score_mod.compute(envelopes)

    categories: list[dict[str, Any]] = []
    for result in trust.categories:
        envelope = envelopes.get(result.category)
        categories.append(
            {
                "category": result.category,
                "label": CATEGORY_LABELS[result.category],
                "score": result.score,
                "confidence": result.confidence,
                "weight": result.weight,
                "available": result.available,
                "counted": result.counted,
                "status": result.status,
                "summary": _category_summary(result.category, envelope),
                "source_name": (envelope or {}).get("source_name"),
                "data_vintage": (
                    envelope["data_vintage"].isoformat() if envelope else None
                ),
            }
        )
    # Present in the mockup's grid order rather than weight order.
    order = {c: i for i, c in enumerate(REPORT_CATEGORIES)}
    categories.sort(key=lambda c: order[c["category"]])

    sources = sorted(
        {
            envelope.get("source_name")
            for envelope in envelopes.values()
            if envelope.get("source_name")
        }
    )

    return LocalityReport(
        locality=locality,
        trust_score=trust,
        verdict=_verdict_sentence(trust, categories),
        biggest_watchout=_biggest_watchout(categories),
        disagreements=reconcile.find(envelopes, scoreable=score_mod.SCOREABLE),
        categories=categories,
        sources_used=sources,
        generated_at=now,
        envelopes=envelopes,
    )
