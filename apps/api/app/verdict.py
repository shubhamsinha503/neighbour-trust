"""Verdict copy for the air quality card.

Lives server-side rather than in the React component on purpose: the same
sentence has to appear on the web card, in the WhatsApp share card (Phase 4), and
in any orchestrator answer that quotes air quality. Three copies of this logic
would drift, and the share card drifting from the app is exactly the thing that
costs trust in a product whose pitch is "we show our work".

Wording rules, from the consumer-psychology section of docs/strategy.md:
  * Lead with the interpretation, not the number — the number is already on the tile.
  * Name the specific pollutant driving it where that changes what a buyer does.
  * Never soften a bad reading. The pratfall effect only works if the admission
    is real.
"""

from __future__ import annotations

from typing import Any, Optional

BAND_VERDICTS: dict[str, str] = {
    "good": "Clean air year-round by Indian city standards — this is about as good as urban India gets.",
    "satisfactory": "Air here is comfortable for most people most of the time, with occasional dips worth watching.",
    "moderate": "Breathable for healthy adults, but sensitive groups — children, older residents, asthmatics — will notice it.",
    "poor": "Air quality is a real daily-life factor here, not a footnote. Expect to run purifiers indoors.",
    "very_poor": "Prolonged exposure is a genuine health concern at these levels. Weigh this heavily.",
    "severe": "Hazardous air. This affects everyone, not just sensitive groups.",
}

BAND_LABELS: dict[str, str] = {
    "good": "Good",
    "satisfactory": "Satisfactory",
    "moderate": "Moderate",
    "poor": "Poor",
    "very_poor": "Very Poor",
    "severe": "Severe",
}

# Score for the 0-100 meter. AQI runs 0-500 where high is bad, the meter runs
# 0-100 where high is good, so this inverts and compresses. Not a linear flip:
# the difference between AQI 40 and 80 matters far less to a buyer than the
# difference between 250 and 300, and the meter should reflect that.
_SCORE_ANCHORS = [(0, 100), (50, 88), (100, 72), (200, 45), (300, 25), (400, 12), (500, 0)]


def score_from_aqi(aqi: float) -> int:
    """Map a CPCB AQI onto the 0-100 category score the meter renders."""
    if aqi <= 0:
        return 100
    for (lo_aqi, lo_score), (hi_aqi, hi_score) in zip(_SCORE_ANCHORS, _SCORE_ANCHORS[1:]):
        if lo_aqi <= aqi <= hi_aqi:
            span = hi_aqi - lo_aqi
            ratio = (aqi - lo_aqi) / span if span else 0
            return round(lo_score + (hi_score - lo_score) * ratio)
    return 0


def trend_direction(trend: list[dict[str, Any]]) -> Optional[str]:
    """Compare the last week against the fortnight before it.

    Needs at least 10 days of data before it says anything — calling a trend off
    three points is how you end up telling someone the air is improving because
    it rained on Tuesday.
    """
    values = [point["aqi"] for point in trend if point.get("aqi") is not None]
    if len(values) < 10:
        return None

    recent = values[-7:]
    earlier = values[-21:-7] or values[:-7]
    if not earlier:
        return None

    recent_mean = sum(recent) / len(recent)
    earlier_mean = sum(earlier) / len(earlier)
    change = recent_mean - earlier_mean

    # 10% either way, so ordinary week-to-week noise isn't reported as a trend.
    threshold = earlier_mean * 0.10
    if change > threshold:
        return "worsening"
    if change < -threshold:
        return "improving"
    return "steady"


def build_verdict(payload: dict[str, Any], confidence: str) -> dict[str, Any]:
    """Headline, eyebrow, score and caveat for the card."""
    band = payload.get("aqi_band", "moderate")
    aqi = payload.get("current_aqi", 0)
    dominant = payload.get("dominant_pollutant")
    direction = trend_direction(payload.get("trend_30d", []))

    headline = BAND_VERDICTS.get(band, BAND_VERDICTS["moderate"])

    if dominant:
        headline += f" {dominant} is what's driving the number today."

    if direction == "worsening":
        headline += " The last week has been worse than the fortnight before it."
    elif direction == "improving":
        headline += " It has been improving over the past week."

    # The honest caveat, sized to how much we actually trust the reading.
    distance = payload.get("nearest_station_km")
    if confidence == "high":
        caveat = f"Measured at a station {distance} km away — close enough to describe this locality directly."
    elif confidence == "medium":
        caveat = (
            f"Nearest station is {distance} km away, so this describes the wider area "
            "rather than this street specifically."
        )
    else:
        caveat = (
            f"Nearest station is {distance} km away, or its last reading is several hours old. "
            "Treat this as indicative, not measured at your doorstep."
        )

    return {
        "headline": headline,
        "eyebrow": "Our take",
        "band_label": BAND_LABELS.get(band, band.replace("_", " ").title()),
        "score": score_from_aqi(aqi),
        "trend_direction": direction,
        "caveat": caveat,
    }
