"""CPCB National Air Quality Index computation.

Why this module exists at all: the upstreams do not agree on a number.

  * CPCB via data.gov.in returns raw pollutant concentrations, no AQI.
  * OpenAQ returns raw pollutant concentrations, no AQI.
  * AQICN returns an AQI, but on the **US EPA** scale, and its `iaqi` values are
    already EPA sub-indices rather than concentrations.

The same PM2.5 concentration lands on a different number and a different word
under the two scales — 90 µg/m³ is "Poor" (201) under CPCB and "Unhealthy" (168)
under US EPA. An Indian buyer cross-checks against CPCB bulletins and the evening
news, both of which use the CPCB scale, so everything we display is CPCB.

Breakpoints are CPCB's published National AQI table (sub-indices for eight
pollutants, of which we handle the seven CPCB's real-time feed carries — Pb is
not in the hourly feed). AQI is the maximum of available sub-indices, not the
average, which is why `dominant_pollutant` is meaningful and worth surfacing.
"""

from __future__ import annotations

from typing import Iterable, NamedTuple, Optional

from neighbour_trust_schema.envelope import AqiBand


class _Segment(NamedTuple):
    conc_lo: float
    conc_hi: float
    index_lo: float
    index_hi: float


# CPCB National AQI breakpoints. Concentrations are µg/m³ over a 24-hour average,
# except CO which is mg/m³ over 8 hours and O3 which is µg/m³ over 8 hours.
#
# Note the band *starts*: 31, 61, 91 for PM2.5 rather than 30, 60, 90. CPCB's
# published table uses inclusive integer bands and its own worked example follows
# them — 45 µg/m³ of PM2.5 is 75, which only comes out if the 51-100 band runs
# from 31 rather than 30. Sharing edges between bands instead (the intuitive
# reading) shifts every sub-index by a point or two and puts us subtly out of
# step with the CPCB bulletins a buyer would check us against.
BREAKPOINTS: dict[str, tuple[_Segment, ...]] = {
    "pm2_5": (
        _Segment(0, 30, 0, 50), _Segment(31, 60, 51, 100), _Segment(61, 90, 101, 200),
        _Segment(91, 120, 201, 300), _Segment(121, 250, 301, 400), _Segment(251, 380, 401, 500),
    ),
    "pm10": (
        _Segment(0, 50, 0, 50), _Segment(51, 100, 51, 100), _Segment(101, 250, 101, 200),
        _Segment(251, 350, 201, 300), _Segment(351, 430, 301, 400), _Segment(431, 510, 401, 500),
    ),
    "no2": (
        _Segment(0, 40, 0, 50), _Segment(41, 80, 51, 100), _Segment(81, 180, 101, 200),
        _Segment(181, 280, 201, 300), _Segment(281, 400, 301, 400), _Segment(401, 520, 401, 500),
    ),
    "o3": (
        _Segment(0, 50, 0, 50), _Segment(51, 100, 51, 100), _Segment(101, 168, 101, 200),
        _Segment(169, 208, 201, 300), _Segment(209, 748, 301, 400), _Segment(749, 1000, 401, 500),
    ),
    "co": (  # mg/m³
        _Segment(0, 1.0, 0, 50), _Segment(1.1, 2.0, 51, 100), _Segment(2.1, 10, 101, 200),
        _Segment(10.1, 17, 201, 300), _Segment(17.1, 34, 301, 400), _Segment(34.1, 50, 401, 500),
    ),
    "so2": (
        _Segment(0, 40, 0, 50), _Segment(41, 80, 51, 100), _Segment(81, 380, 101, 200),
        _Segment(381, 800, 201, 300), _Segment(801, 1600, 301, 400), _Segment(1601, 2400, 401, 500),
    ),
    "nh3": (
        _Segment(0, 200, 0, 50), _Segment(201, 400, 51, 100), _Segment(401, 800, 101, 200),
        _Segment(801, 1200, 201, 300), _Segment(1201, 1800, 301, 400), _Segment(1801, 2400, 401, 500),
    ),
}

# ppb -> µg/m³ at 25 °C and 1 atm (molecular weight / 24.45 molar volume).
# Used only when an upstream reports ppb and no µg/m³ sensor exists at that
# station; native µg/m³ is always preferred, since this conversion assumes a
# standard temperature and pressure that a real Indian summer does not honour.
PPB_TO_UGM3: dict[str, float] = {
    "no2": 1.8816,
    "so2": 2.6203,
    "o3": 1.9632,
    "nh3": 0.6965,
    "co": 1.1456,   # yields µg/m³; convert to mg/m³ before indexing CO
}

PARTICULATES = ("pm2_5", "pm10")
MIN_POLLUTANTS_FOR_AQI = 3


def sub_index(pollutant: str, concentration: float) -> Optional[float]:
    """CPCB sub-index for one pollutant, by linear interpolation within its band.

    Returns None for an unknown pollutant or a negative reading (stations report
    negative values when a sensor is faulted; treating those as zero would quietly
    improve the AQI).
    """
    segments = BREAKPOINTS.get(pollutant)
    if segments is None or concentration is None or concentration < 0:
        return None

    for seg in segments:
        if concentration <= seg.conc_hi:
            span = seg.conc_hi - seg.conc_lo
            if span == 0:
                return seg.index_hi
            value = seg.index_lo + (seg.index_hi - seg.index_lo) * (concentration - seg.conc_lo) / span
            # A reading in the 1-unit dead zone between bands (e.g. 30.4 µg/m³ of
            # PM2.5, above the 0-30 band and below the 31-60 one) would otherwise
            # interpolate to just under the band floor.
            return max(value, seg.index_lo)

    # Above the top breakpoint. CPCB's scale ends at 500; a reading beyond it is
    # reported as 500 rather than extrapolated into a number the scale has no
    # meaning for.
    return 500.0


def band_for(aqi: float) -> AqiBand:
    """CPCB's six-band scale — the words that appear on the card."""
    if aqi <= 50:
        return AqiBand.GOOD
    if aqi <= 100:
        return AqiBand.SATISFACTORY
    if aqi <= 200:
        return AqiBand.MODERATE
    if aqi <= 300:
        return AqiBand.POOR
    if aqi <= 400:
        return AqiBand.VERY_POOR
    return AqiBand.SEVERE


class AqiResult(NamedTuple):
    aqi: float
    dominant_pollutant: str
    band: AqiBand
    sub_indices: dict[str, float]


def compute_aqi(concentrations: dict[str, float]) -> Optional[AqiResult]:
    """CPCB National AQI from a dict of pollutant -> concentration.

    Returns None when CPCB's own minimum-data rule isn't met: an AQI needs at
    least three pollutants, and one of them must be PM2.5 or PM10. Publishing a
    number from two trace gases would be exactly the false precision the product
    is meant to avoid — the caller should surface "not enough data" instead.
    """
    sub_indices: dict[str, float] = {}
    for pollutant, value in concentrations.items():
        if value is None:
            continue
        idx = sub_index(pollutant, value)
        if idx is not None:
            sub_indices[pollutant] = idx

    if len(sub_indices) < MIN_POLLUTANTS_FOR_AQI:
        return None
    if not any(p in sub_indices for p in PARTICULATES):
        return None

    dominant = max(sub_indices, key=lambda p: sub_indices[p])
    aqi = round(sub_indices[dominant], 1)
    return AqiResult(
        aqi=aqi,
        dominant_pollutant=dominant,
        band=band_for(aqi),
        sub_indices=sub_indices,
    )


def band_label(band: AqiBand) -> str:
    """Human-readable band name, matching CPCB bulletin wording."""
    return {
        AqiBand.GOOD: "Good",
        AqiBand.SATISFACTORY: "Satisfactory",
        AqiBand.MODERATE: "Moderate",
        AqiBand.POOR: "Poor",
        AqiBand.VERY_POOR: "Very Poor",
        AqiBand.SEVERE: "Severe",
    }[band]


def pollutant_label(pollutant: str) -> str:
    return {
        "pm2_5": "PM2.5", "pm10": "PM10", "no2": "NO₂",
        "so2": "SO₂", "co": "CO", "o3": "O₃", "nh3": "NH₃",
    }.get(pollutant, pollutant)
