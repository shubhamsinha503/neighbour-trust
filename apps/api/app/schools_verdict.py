"""Verdict copy for the schools card.

Same reasoning as verdict.py for air quality: the sentence has to be identical on
the web card, the share card and any orchestrator answer, so it is computed once
server-side.

The copy here does more work than air quality's, because the honest story is more
complicated. A buyer sees "61 schools within 2 km" and will assume we know
something about all 61. We know staffing for one of them, from 2022. Every
sentence below exists to keep that from being misread.
"""

from __future__ import annotations

from typing import Any, Optional

# Highest share of the meter a locality can reach on access data alone, with no
# staffing figures behind it.
PARTIAL_EVIDENCE_CEILING = 0.75


def _score_from_density_and_ratio(
    within_2km: int, median_ptr: Optional[float]
) -> int:
    """0-100 for the meter.

    Density and staffing are combined only when both exist. With no staffing
    data the score reflects access alone — how many schools are actually within
    reach — which is a real thing to know and is honestly all we have.
    """
    # Access: 20+ schools within 2 km is saturated for a city neighbourhood.
    access = min(100.0, (within_2km / 20.0) * 100.0)

    if median_ptr is None:
        # Access alone cannot earn full marks. Indiranagar has 61 schools within
        # 2 km and staffing data for exactly one of them — scoring that 100/100
        # directly contradicts the caveat printed beneath it, and a meter that
        # says "perfect" while the text says "we know almost nothing" reads as
        # carelessness rather than honesty. The ceiling is the score admitting
        # what the evidence supports.
        return round(access * PARTIAL_EVIDENCE_CEILING)

    # Staffing: 20:1 or better is full marks, 60:1 is zero. RTE norm is 30:1.
    staffing = max(0.0, min(100.0, 100.0 - (median_ptr - 20.0) * (100.0 / 40.0)))
    return round(access * 0.5 + staffing * 0.5)


def build_verdict(payload: dict[str, Any], confidence: str) -> dict[str, Any]:
    within_2km = payload.get("schools_within_2km", 0)
    within_5km = payload.get("schools_within_5km", 0)
    with_staffing = payload.get("schools_with_staffing_data", 0)
    median_ptr = payload.get("median_pupil_teacher_ratio")
    presence_source = payload.get("presence_source") or "our sources"

    if within_2km >= 20:
        headline = f"Plenty of schools within walking or short-drive distance — {within_2km} inside 2 km."
    elif within_2km >= 8:
        headline = f"A reasonable choice of schools nearby, with {within_2km} inside 2 km."
    elif within_2km >= 1:
        headline = (
            f"Thin on schools immediately nearby — {within_2km} within 2 km, "
            f"{within_5km} if you widen to 5 km."
        )
    else:
        headline = f"No schools recorded within 2 km; {within_5km} within 5 km."

    if median_ptr is not None:
        if median_ptr <= 25:
            headline += f" Where we have staffing data, class sizes look comfortable ({median_ptr:.0f} pupils per teacher)."
        elif median_ptr <= 35:
            headline += f" Staffing sits around the legal norm ({median_ptr:.0f} pupils per teacher)."
        else:
            headline += f" Schools we have data for are stretched ({median_ptr:.0f} pupils per teacher)."

    # The caveat is the honest core of this card, so it is specific rather than
    # generic — it names the actual gap between what is counted and what is known.
    if with_staffing == 0:
        caveat = (
            f"School locations come from {presence_source}. We have no staffing or "
            "enrolment figures for any of them, so this card tells you what is nearby, "
            "not how good it is."
        )
    elif with_staffing < within_2km:
        caveat = (
            f"School locations come from {presence_source} and are current. Staffing "
            f"figures exist for only {with_staffing} of the {within_2km} schools within "
            "2 km, and come from the 2022 UDISE survey — so the ratio above describes "
            "that subset, not the neighbourhood."
        )
    else:
        caveat = (
            f"Based on the 2022 UDISE survey. Enrolment and staffing will have moved "
            "since, and UDISE carries no exam results, so nothing here measures teaching "
            "quality — only capacity."
        )

    return {
        "headline": headline,
        "eyebrow": "Our take",
        "score": _score_from_density_and_ratio(within_2km, median_ptr),
        "caveat": caveat,
        # Surfaced separately so the card can show it as its own line rather than
        # burying the most important limitation inside a paragraph.
        "quality_disclaimer": (
            "No exam results are published in any open dataset for these schools, "
            "so this is a measure of access and capacity — never of teaching quality."
        ),
    }
