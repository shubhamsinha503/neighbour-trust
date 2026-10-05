"""Verdict copy for the schools card.

Same reasoning as verdict.py for air quality: the sentence has to be identical on
the web card, the share card and any orchestrator answer, so it is computed once
server-side.

The honest story here is narrower than it looks. A buyer sees "20 schools within
2 km" and will assume we know something about those schools. We do not — no open
Indian source describes school quality at locality level. So this card answers
one question only, and says so: how many schools are near, and how close. Every
sentence below exists to keep "nearby" from being read as "good".
"""

from __future__ import annotations

from typing import Any

# Highest share of the meter school access alone can reach. How many schools are
# nearby is a real thing to know, but it is not how good they are, so a
# saturated-access locality reads as "plenty nearby", never a perfect 100.
ACCESS_CEILING = 0.75


def _score_from_access(within_2km: int) -> int:
    """0-100 from how many schools are within reach. Quality is not measured."""
    # Access: 20+ schools within 2 km is saturated for a city neighbourhood.
    access = min(100.0, (within_2km / 20.0) * 100.0)
    return round(access * ACCESS_CEILING)


def build_verdict(payload: dict[str, Any], confidence: str) -> dict[str, Any]:
    within_2km = payload.get("schools_within_2km", 0)
    within_5km = payload.get("schools_within_5km", 0)
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

    # The caveat is the honest core of this card: it scopes the claim to what the
    # count can actually support — presence, not quality.
    caveat = (
        f"School locations come from {presence_source}. This card tells you how "
        "many schools are nearby and how close they are — not how good they are, "
        "which no open dataset covers at this level."
    )

    return {
        "headline": headline,
        "eyebrow": "Our take",
        "score": _score_from_access(within_2km),
        "caveat": caveat,
        # Surfaced separately so the card can show it as its own line rather than
        # burying the most important limitation inside a paragraph.
        "quality_disclaimer": (
            "No exam results are published in any open dataset for these schools, "
            "so this is a measure of access — how many are nearby — never of "
            "teaching quality."
        ),
    }
