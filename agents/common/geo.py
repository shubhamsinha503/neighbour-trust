"""H3 indexing helpers shared by every agent.

All H3 work happens here rather than in the database — see the note at the top of
infra/migrations/001_init.sql for why.
"""

from __future__ import annotations

import math

import h3

from agents.common.config import H3_RESOLUTION

EARTH_RADIUS_KM = 6371.0088


def cell_for(lat: float, lon: float, resolution: int = H3_RESOLUTION) -> str:
    """H3 cell containing a point."""
    return h3.latlng_to_cell(lat, lon, resolution)


def cell_centroid(cell: str) -> tuple[float, float]:
    """(lat, lon) of a cell's centre — what we store as the envelope's geom."""
    lat, lon = h3.cell_to_latlng(cell)
    return lat, lon


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km.

    Used for nearest_station_km, which is not cosmetic: the air quality agent's
    confidence rule keys off it (High under ~5 km, Low beyond — see
    docs/strategy.md). Computed here rather than in PostGIS so the agent can rank
    candidate stations before anything is written.
    """
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))
