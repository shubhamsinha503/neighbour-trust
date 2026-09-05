"""Category scores and the composite Neighbourhood Trust Score.

The single hardest decision here is what to do when most categories have no data,
which is the actual situation: air quality and schools are live, crime and water
have press coverage only, power and infrastructure have nothing.

Three options, and why this file takes the third:

  1. **Score missing categories as zero.** Turns "we haven't built this yet" into
     "this neighbourhood is bad", which is a lie about the locality.
  2. **Score missing categories as average.** Invents a number, and worse, makes
     every locality converge toward the same score — destroying the only thing a
     comparison is for.
  3. **Score only what is known, renormalise the weights over it, and report the
     coverage prominently.** The score means "out of what we can see", and the
     page says how much that is.

The third is the only one compatible with docs/strategy.md's central claim that
the product's differentiator is showing its work.

**Crime and water deliberately contribute no score at all**, even though they
have envelopes. Their only input today is press coverage, and the strategy doc is
explicit that coverage is a function of media-market size rather than incident
rate — folding it into a number would make well-covered neighbourhoods look
dangerous. They appear on the report as disclosure, not as points.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from agents.orchestrator import press_score

# Weights over the six categories. These are a product judgement, not a
# measurement — they encode what a typical Indian home buyer weighs, with the
# categories that affect daily life every single day (air, water, power) and the
# ones that drive long-term value (schools, infrastructure) both represented.
# They are deliberately in one visible table so they can be argued with.
CATEGORY_WEIGHTS: dict[str, float] = {
    "air_quality": 0.20,
    "schools": 0.20,
    "crime": 0.20,
    "water": 0.15,
    "power": 0.15,
    "infrastructure": 0.10,
}

# Categories that can currently produce a score. The rest appear on the report
# with their status, contributing nothing to the number.
SCOREABLE = ("air_quality", "schools", "crime", "water", "power")

# Display names, so copy generated here matches the labels on the cards.
LABELS = {
    "schools": "Schools",
    "crime": "Safety",
    "air_quality": "Air quality",
    "water": "Water",
    "power": "Power",
    "infrastructure": "Infrastructure",
}

# Below this share of total weight, no composite is published at all. Two
# categories out of six is 40% of the weight — thin, but a real signal about air
# and schools. One category would be a single measurement wearing the word
# "Trust Score", which is worse than no score.
MIN_WEIGHT_COVERAGE = 0.35


# --- Per-category scores ----------------------------------------------------

# AQI is 0-500 where high is bad; the meter is 0-100 where high is good.
#
# Not a linear flip. The curve is steepest across AQI 100-200 — the Moderate-to-
# Poor stretch where air goes from "fine for most people" to "affects everyone",
# which is the range where a buyer's decision actually changes. It is shallower
# at both ends on purpose: 0 to 50 is the difference between clean and clean, and
# by 300 the score is already 25, so further decline restates a verdict the
# reader has already had.
_AQI_ANCHORS = [(0, 100), (50, 88), (100, 72), (200, 45), (300, 25), (400, 12), (500, 0)]


def score_from_aqi(aqi: float) -> int:
    """Map a CPCB AQI onto the 0-100 category score."""
    if aqi <= 0:
        return 100
    for (lo_aqi, lo_score), (hi_aqi, hi_score) in zip(_AQI_ANCHORS, _AQI_ANCHORS[1:]):
        if lo_aqi <= aqi <= hi_aqi:
            span = hi_aqi - lo_aqi
            ratio = (aqi - lo_aqi) / span if span else 0
            return round(lo_score + (hi_score - lo_score) * ratio)
    return 0


# Highest share of the schools meter reachable on access data alone, with no
# staffing figures behind it. A locality with 61 schools nearby and staffing
# known for one of them has not earned 100/100.
PARTIAL_EVIDENCE_CEILING = 0.75


def score_from_schools(within_2km: int, median_ptr: Optional[float]) -> int:
    """0-100 from school access, and staffing where it is known."""
    access = min(100.0, (within_2km / 20.0) * 100.0)
    if median_ptr is None:
        return round(access * PARTIAL_EVIDENCE_CEILING)
    # 20:1 or better is full marks, 60:1 is zero. The RTE norm is 30:1.
    staffing = max(0.0, min(100.0, 100.0 - (median_ptr - 20.0) * (100.0 / 40.0)))
    return round(access * 0.5 + staffing * 0.5)


def category_score(category: str, payload: dict[str, Any]) -> Optional[int]:
    """0-100 for one category, or None if it cannot honestly be scored."""
    if category == "air_quality":
        aqi = payload.get("current_aqi")
        return score_from_aqi(aqi) if aqi is not None else None

    if category == "schools":
        return score_from_schools(
            payload.get("schools_within_2km", 0),
            payload.get("median_pupil_teacher_ratio"),
        )

    if category in press_score.SCORERS:
        return press_score.score(category, payload)

    # infrastructure: no agent yet.
    return None


# --- Composite --------------------------------------------------------------


@dataclass
class CategoryResult:
    category: str
    score: Optional[int]
    confidence: Optional[str]
    weight: float
    available: bool
    status: str  # short phrase the UI shows when there is no score
    counted: bool = False


@dataclass
class TrustScore:
    """The composite, plus everything needed to be honest about it."""

    score: Optional[int]
    weight_covered: float          # share of total weight that produced the score
    categories_counted: int
    categories_total: int
    categories: list[CategoryResult] = field(default_factory=list)
    reason_unavailable: Optional[str] = None

    @property
    def coverage_pct(self) -> int:
        return round(self.weight_covered * 100)


STATUS_TEXT = {
    "air_quality": "no live reading — upstream feed unavailable",
    "schools": "no data",
    "crime": "no local press coverage found in 12 months",
    "water": "no local press coverage found in 12 months",
    "power": "no local press coverage found in 12 months",
    "infrastructure": "no source yet — RERA scraping planned",
}


def _no_score_reason(results: list[CategoryResult]) -> str:
    """Why there is no composite, without contradicting the page around it.

    This read "Only 1 of 6 categories have data for this locality" on pages that
    were visibly showing three cards. It was counting *scoreable* categories and
    calling them *data*, so a reader could see it was wrong — on a product whose
    entire proposition is that its numbers are trustworthy.

    Scoreable and present are genuinely different things here, and the difference
    is deliberate: safety and water have data and are excluded from scoring on
    purpose, because press coverage measures attention rather than incidence.
    Saying so is more convincing than a bare count.
    """
    available = [r for r in results if r.available]
    scoreable = [r for r in available if r.counted]
    unscored = [r for r in available if not r.counted]

    if not available:
        return (
            "We have no data for this locality yet. Rather than estimate, we "
            "leave it empty until a source we trust covers it."
        )

    parts = [
        f"Only {len(scoreable)} of {len(CATEGORY_WEIGHTS)} categories can be "
        f"scored here, which is too little to put a single number on."
    ]
    if unscored:
        labels = sorted(LABELS.get(r.category, r.category) for r in unscored)
        names = (
            labels[0] if len(labels) == 1
            else ", ".join(labels[:-1]) + " and " + labels[-1]
        )
        parts.append(
            f"{names} {'has' if len(unscored) == 1 else 'have'} data below, but "
            f"come from press coverage and are deliberately never scored — how "
            f"often an area is written about is not how often things happen there."
        )
    parts.append("Everything we do know is shown individually below.")
    return " ".join(parts)


def compute(envelopes: dict[str, dict[str, Any]]) -> TrustScore:
    """Composite Trust Score from whatever category envelopes exist.

    `envelopes` maps category -> the stored envelope (or is missing the key
    entirely when that category has nothing).
    """
    results: list[CategoryResult] = []
    weighted_total = 0.0
    weight_covered = 0.0

    for category, weight in CATEGORY_WEIGHTS.items():
        envelope = envelopes.get(category)
        payload = (envelope or {}).get("payload") or {}
        score = category_score(category, payload) if envelope else None

        counted = score is not None and category in SCOREABLE
        if counted:
            weighted_total += score * weight
            weight_covered += weight

        results.append(
            CategoryResult(
                category=category,
                score=score,
                confidence=(envelope or {}).get("confidence"),
                weight=weight,
                available=envelope is not None,
                status=(
                    "scored"
                    if counted
                    else STATUS_TEXT.get(category, "no data")
                ),
                counted=counted,
            )
        )

    counted_n = sum(1 for r in results if r.counted)

    if weight_covered < MIN_WEIGHT_COVERAGE:
        return TrustScore(
            score=None,
            weight_covered=weight_covered,
            categories_counted=counted_n,
            categories_total=len(CATEGORY_WEIGHTS),
            categories=results,
            reason_unavailable=_no_score_reason(results),
        )

    # Renormalise over what was actually counted, so the score reads "out of what
    # we can see" rather than being dragged down by absent categories.
    return TrustScore(
        score=round(weighted_total / weight_covered),
        weight_covered=weight_covered,
        categories_counted=counted_n,
        categories_total=len(CATEGORY_WEIGHTS),
        categories=results,
    )
