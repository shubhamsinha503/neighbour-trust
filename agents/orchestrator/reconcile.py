"""Surfacing disagreement between sources.

docs/strategy.md names this as the product's actual differentiator, above any
single data source: "explicitly surfaces disagreements — e.g. 'official water
data says adequate supply, but 12 resident reports in the last 90 days describe
tanker dependence' — rather than silently averaging them away".

The example in the doc needs resident reports, which do not exist yet. But the
pipeline already stores three genuine disagreements that can be surfaced today,
and each is a real thing a buyer would want to know:

  1. **Two AQI numbers for the same locality.** CPCB and AQICN are both stored,
     on different scales, and are frequently far apart. Reporting only the CPCB
     figure without saying the other exists is the "silent averaging" failure in
     a different costume.
  2. **A category counted vs a category merely covered.** Press coverage exists
     for crime and water but produces no score, and a reader who sees incident
     counts will assume otherwise unless told.

What this module deliberately does NOT do is resolve the conflicts. Picking a
winner and hiding the loser is exactly the behaviour the strategy doc argues
against; the job here is to make the disagreement visible and legible.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class Disagreement:
    """One conflict between sources, phrased for a reader rather than a log."""

    category: str
    headline: str
    detail: str
    severity: str  # "info" | "notable"


def _aqi_scale_conflict(envelopes: dict[str, Any]) -> Optional[Disagreement]:
    """CPCB vs AQICN on the same air.

    They are on different scales — CPCB's National AQI and the US EPA's — so the
    numbers are not directly comparable, and that incomparability is the point.
    A buyer who checks a phone app showing the EPA figure will see a different
    number from ours and should know why before concluding one of us is wrong.
    """
    cpcb = envelopes.get("air_quality")
    aqicn = envelopes.get("air_quality_aqicn")
    if not cpcb or not aqicn:
        return None

    cpcb_aqi = (cpcb.get("payload") or {}).get("current_aqi")
    epa_aqi = (aqicn.get("payload") or {}).get("epa_aqi")
    if cpcb_aqi is None or epa_aqi is None:
        return None

    return Disagreement(
        category="air_quality",
        headline=f"Two different AQI figures exist for here: {round(cpcb_aqi)} and {round(epa_aqi)}",
        detail=(
            f"We show {round(cpcb_aqi)}, computed on CPCB's National AQI scale from "
            f"24-hour average concentrations — the same method Indian bulletins use. "
            f"AQICN reports {round(epa_aqi)} for a nearby station on the US EPA scale. "
            "Neither is wrong; they are different scales, and the same air produces "
            "different numbers under each. Most international phone apps show the EPA one."
        ),
        severity="info",
    )


def _unscored_coverage(envelopes: dict[str, Any], scoreable: tuple[str, ...]) -> list[Disagreement]:
    """Categories with information that deliberately earns no points."""
    found = []
    for category in ("crime", "water"):
        envelope = envelopes.get(category)
        if not envelope:
            continue
        news = (envelope.get("payload") or {}).get("news") or {}
        incidents = news.get("incidents_12m", 0)
        if not incidents:
            continue

        label = "safety" if category == "crime" else "water"
        found.append(
            Disagreement(
                category=category,
                headline=(
                    f"{incidents} {label} incident(s) reported in local press over 12 months — "
                    "not counted in the score"
                ),
                detail=(
                    "Press coverage reflects how closely an area is reported on as much as what "
                    "happens there, so a well-covered neighbourhood looks worse than an "
                    "identical but ignored one. We show the incidents so you can read them, "
                    "and keep them out of the number so they cannot quietly distort it."
                ),
                severity="info",
            )
        )
    return found


def find(envelopes: dict[str, Any], *, scoreable: tuple[str, ...] = ()) -> list[Disagreement]:
    """Every disagreement worth showing, most significant first."""
    found: list[Disagreement] = []

    result = _aqi_scale_conflict(envelopes)
    if result is not None:
        found.append(result)

    found.extend(_unscored_coverage(envelopes, scoreable))

    # "notable" ahead of "info" — a reader who stops after one should get the one
    # that most changes how they read the page.
    found.sort(key=lambda d: 0 if d.severity == "notable" else 1)
    return found
