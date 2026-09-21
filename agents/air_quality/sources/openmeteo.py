"""Open-Meteo Air Quality — a modelled PM2.5 fallback (Copernicus CAMS).

The station sources (CPCB, OpenAQ, AQICN) all answer "no live station within
range" the moment upstream feeds go quiet — which, since CPCB's network fell
silent in August 2026, is most of the time for most localities. This source is
the floor beneath them: the Copernicus Atmosphere Monitoring Service (CAMS)
model, served free and keyless by Open-Meteo, gives a PM2.5 concentration for
*any* coordinate. So every locality can carry an air figure, always.

The honesty this demands is real and handled by the caller: a model is not a
measurement. This returns a PM2.5 *concentration* in µg/m³ — the same physical
unit CPCB's breakpoints are defined on, so no scale conversion — and the agent
publishes it at LOW confidence with aqi_basis="cams_model" and the source named
"Copernicus CAMS (modelled)", so no consumer can mistake it for a ground reading.

Only PM2.5 is used, not the gaseous pollutants CAMS also models: PM2.5 dominates
the Indian AQI, and mixing in CO/NO2/etc. would drag in unit conversions (CAMS
serves CO in µg/m³, CPCB indexes it in mg/m³) whose error is not worth it for a
figure already labelled an estimate.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import httpx

BASE_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
SOURCE_NAME = "Copernicus CAMS (modelled)"
SOURCE_URL = "https://open-meteo.com/en/docs/air-quality-api"

# CAMS is a coarse (~tens-of-km) model, so neighbouring localities get an
# identical answer. Rounding the query to ~11 km and caching within a run turns
# one call per locality (~1,300/run, over the free quota at hourly cadence) into
# roughly one per grid cell (~100/run). The cache is per process, which is one
# ingest run — exactly the scope we want.
_GRID = 1  # decimal places to round to: 0.1° ≈ 11 km
_cache: dict[tuple[float, float], "Optional[CamsReading]"] = {}


def _remember(
    key: "tuple[float, float]", value: "Optional[CamsReading]"
) -> "Optional[CamsReading]":
    _cache[key] = value
    return value


@dataclass(frozen=True)
class CamsReading:
    """A modelled PM2.5 reading for a point, in CPCB's units (µg/m³)."""

    pm2_5_24h: float  # trailing 24-hour mean — what CPCB's breakpoints expect
    pm2_5_latest: float  # most recent modelled hour, for the "latest hour" line
    observed_at: datetime


def cams_pm25(
    lat: float,
    lon: float,
    *,
    now: Optional[datetime] = None,
    timeout: float = 30.0,
) -> Optional[CamsReading]:
    """Modelled PM2.5 for a coordinate, or None if the model has nothing usable.

    Fetches the last 24 hours of hourly PM2.5, averages them for the 24-hour mean
    and keeps the most recent hour. Never raises for a data gap — a None return
    is a clean "no figure", which the caller treats like any other skip.
    """
    now = now or datetime.now(timezone.utc)

    # Snap to the grid and reuse a cell's answer for every locality in it.
    glat, glon = round(lat, _GRID), round(lon, _GRID)
    if (glat, glon) in _cache:
        return _cache[(glat, glon)]

    try:
        resp = httpx.get(
            BASE_URL,
            params={
                "latitude": f"{glat:.4f}",
                "longitude": f"{glon:.4f}",
                "hourly": "pm2_5",
                "past_days": 1,
                "forecast_days": 1,
                "timezone": "UTC",
            },
            timeout=timeout,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return _remember((glat, glon), None)

    hourly = data.get("hourly") or {}
    times = hourly.get("time") or []
    values = hourly.get("pm2_5") or []
    if not times or not values or len(times) != len(values):
        return _remember((glat, glon), None)

    # Pair each modelled hour with its value, drop gaps and anything in the
    # future, and take the trailing 24 hours up to now.
    points: list[tuple[datetime, float]] = []
    for t, v in zip(times, values):
        if v is None:
            continue
        try:
            ts = datetime.fromisoformat(t).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if ts > now:
            continue
        points.append((ts, float(v)))

    if not points:
        return _remember((glat, glon), None)

    points.sort(key=lambda p: p[0])
    window = points[-24:]
    mean = sum(v for _, v in window) / len(window)
    latest_ts, latest_val = window[-1]

    return _remember(
        (glat, glon),
        CamsReading(
            pm2_5_24h=round(mean, 1),
            pm2_5_latest=round(latest_val, 1),
            observed_at=latest_ts,
        ),
    )
