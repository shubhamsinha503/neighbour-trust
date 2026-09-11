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
from agents.orchestrator import (  # noqa: I001
    flags as flags_mod,
    reconcile,
    reports as reports_mod,
    score as score_mod,
)

log = logging.getLogger(__name__)

# Categories the report shows, in the order the mockup's grid uses.
#
# Power is deliberately absent as of 2026-09-06. On the live site it rendered a
# dash for 42 of 44 localities and a score for exactly one: a column of dashes
# that made the page look broken while telling nobody anything. It is still
# collected and still moves the score — downward only, and only alongside a flag
# that says why in words. See score.POWER_PENALTIES.
REPORT_CATEGORIES = (
    "schools",
    "crime",
    "air_quality",
    "water",
    "infrastructure",
)

# Power keeps its label: it no longer has a card, but its flags still name it.

# Human labels, matching the mockup.
CATEGORY_LABELS = {
    "schools": "Schools",
    "crime": "Safety",
    "air_quality": "Air quality",
    "water": "Water",
    "power": "Power",
    "infrastructure": "Connectivity",
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
    flags: list[dict[str, str]] = field(default_factory=list)
    # Infrastructure reported as planned, under way or newly opened nearby.
    # Headlines, not a summary — see `_upcoming`.
    upcoming: list[dict[str, Any]] = field(default_factory=list)


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
        if fresh.historical:
            # Kept, not dropped. The card shows it with its date; score.compute
            # refuses to count it. See agents/common/freshness.py for why those
            # are different decisions.
            log.info("[%s] %s is historical: %s", h3_cell, category, fresh.reason)
            envelope["historical"] = True
            envelope["historical_note"] = fresh.reason
        envelopes[category] = envelope

    # AQICN is stored as its own envelope under the air_quality category, on the
    # US EPA scale. Pulled out separately so the reconciler can compare the two
    # without it ever being mistaken for the headline figure.
    aqicn = db.latest_envelope_by_source(
        conn, category="air_quality", h3_cell=h3_cell, source_name="AQICN"
    )
    if aqicn is not None:
        envelopes["air_quality_aqicn"] = aqicn

    # Development is loaded but is deliberately not in REPORT_CATEGORIES: it has
    # no card, no score and no weight. It is what the local press says is coming,
    # which is worth showing and must never become a number — press attention
    # tracks media-market size, so counting it would credit a well-covered
    # neighbourhood with more planned than an identical one nobody writes about.
    development = db.latest_envelope(conn, category="development", h3_cell=h3_cell)
    if development is not None:
        envelopes["development"] = development

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


def _dated_if_historical(summary: str, envelope: Optional[dict[str, Any]]) -> str:
    """Put the measurement date in front of a reading that is no longer current.

    The tile shows this line under a number. "PM2.5 index 42 (moderate)" reads as
    today's air whatever the border style around it, so the date has to be in the
    sentence itself — the tile is small enough that nothing else is guaranteed to
    be read alongside it.

    Applied at assembly rather than inside each category's branch, so a category
    that becomes historical later cannot forget to do it.
    """
    if not summary or not envelope or not envelope.get("historical"):
        return summary
    vintage = envelope.get("data_vintage")
    if vintage is None:
        return f"Last known reading · {summary}"
    # "%-d" is not portable to Windows, where this is developed.
    return f"Last measured {vintage.strftime('%d %b').lstrip('0')} · {summary}"


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

    if category == "infrastructure":
        return payload.get("summary") or ""

    if category in ("crime", "water", "power"):
        news = payload.get("news") or {}
        n = news.get("incidents_12m", 0)

        # A partly-classified locality understates its own count, and does so
        # invisibly. When a run hits its classification cap the leftover mentions
        # are simply whichever the query returned last, so one locality can be
        # fully assessed while the next is half assessed — and comparing their
        # counts then compares how far a batch job got, not the places. Said
        # plainly rather than left for the reader to not notice.
        fetched = news.get("mentions_fetched") or 0
        classified = news.get("mentions_classified") or 0
        if fetched and classified < fetched * 0.9:
            pct = round(classified / fetched * 100)
            return (
                f"{n} incident(s) so far · only {pct}% of {fetched} articles "
                f"assessed yet, so this undercounts"
            )
        # Lead with what kind, not how many — the count is the part distorted by
        # how much press attention a locality gets.
        described = news.get("characterisation")
        if described:
            return described
        # "not scored" meant a refusal when these categories were excluded from
        # the composite on principle. They are scored now, and below three
        # incidents there is simply too little to read a pattern from — a
        # different statement, and the old wording implies a policy that no
        # longer exists.
        if n == 0:
            return "Nothing reported in local press in the last 12 months"
        return (
            f"{n} incident(s) in local press (12 months) — too few to score"
        )

    return ""


def _upcoming(envelopes: dict[str, Any], limit: int = 4) -> list[dict[str, Any]]:
    """What the local press reports as coming, as headlines.

    Deliberately not summarised into a claim. Two of the three confirmed items
    for Hebbal are about a metro proposal being *delayed*, and any sentence
    this code could write from them — "metro line planned" — would turn a
    stalled proposal into a promise. The headline says what was reported; the
    reader can weigh it, which is the whole posture of this product.

    Never scored, and not a category on the grid. Press attention tracks
    media-market size, so counting what is coming would tell a buyer that a
    well-covered neighbourhood has more planned than an identical one nobody
    writes about — the distortion the volume rules exist to prevent everywhere
    else here.
    """
    envelope = envelopes.get("development")
    if not envelope:
        return []
    news = (envelope.get("payload") or {}).get("news") or {}
    out: list[dict[str, Any]] = []
    for item in (news.get("recent") or []):
        if not item.get("incident_type"):
            continue          # unjudged or rejected — absence is not a finding
        out.append({
            "headline": item.get("title"),
            "kind": item.get("incident_type"),
            "published_at": item.get("published_at"),
            "url": item.get("url"),
            "source": item.get("source_name"),
        })
        if len(out) >= limit:
            break
    return out


def build_report(conn, locality: dict[str, Any]) -> LocalityReport:
    now = datetime.now(timezone.utc)
    envelopes = _load_envelopes(conn, locality["h3_cell"])

    # Accepted resident reports, grouped by category. Only accepted ones exist
    # as far as this is concerned — a pending report is not weaker evidence, it
    # is evidence nobody has looked at yet.
    accepted = db.accepted_reports(conn, h3_cell=locality["h3_cell"])
    reports_by_category: dict[str, list[dict[str, Any]]] = {}
    for report in accepted:
        reports_by_category.setdefault(report["category"], []).append(report)

    trust = score_mod.compute(envelopes, reports_by_category)

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
                "is_baseline": result.is_baseline,
                "status": result.status,
                "summary": _dated_if_historical(
                    _category_summary(result.category, envelope), envelope
                ),
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

    # Resident flags join the ones derived from press and sensors, and are
    # sorted together by severity rather than appended after: a first-hand
    # account of an assault outranks a middling category score, and putting
    # residents in a second-class list below the automated findings would say
    # the opposite of what this product claims about them.
    found_flags = flags_mod.find(envelopes, categories)
    found_flags.extend(reports_mod.to_flags(accepted))
    found_flags.sort(key=lambda f: flags_mod.SEVERITY_ORDER.get(f["severity"], 9))

    return LocalityReport(
        locality=locality,
        trust_score=trust,
        verdict=_verdict_sentence(trust, categories),
        flags=found_flags,
        biggest_watchout=flags_mod.headline_flag(found_flags),
        disagreements=reconcile.find(envelopes, scoreable=score_mod.SCOREABLE),
        categories=categories,
        sources_used=sources,
        generated_at=now,
        envelopes=envelopes,
        upcoming=_upcoming(envelopes),
    )
