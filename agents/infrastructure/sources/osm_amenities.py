"""What is actually built around a locality, from OpenStreetMap.

docs/strategy.md defines the infrastructure category as RERA registrations and
upcoming metro and highway plans — builder track record and what is coming. That
remains the right ambition and is a scraping-or-partnership problem: every state
runs its own RERA portal, none has an API, and the master plans are PDFs.

This is a different and more checkable thing: what is *already there*. A metro
station eight hundred metres away, a hospital within two kilometres, a park on
the next street — and industrial land next door. A buyer weighs all of that, no
Indian source publishes it per locality, and OpenStreetMap has it for free.

The card says which of the two it is showing. Quietly redefining a category is
how a product stops meaning what it says.

Google Places would answer the same question and costs money per call with a
billing account attached; Overpass is free and the schools agent already proves
it works at this scale.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Optional

import httpx

log = logging.getLogger(__name__)

SOURCE_NAME = "OpenStreetMap"
SOURCE_URL = "https://www.openstreetmap.org/copyright"

# The main endpoint refused every request during development while this mirror
# answered, so the mirror leads and the main one is the fallback.
ENDPOINTS = (
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
)
RETRY_WAITS = (5, 15)
REQUEST_TIMEOUT = 90.0

# How far counts as "nearby" for a walkable amenity. Two and a half kilometres is
# a short auto ride rather than a walk, which is how these are actually reached
# in Bengaluru and Gurugram.
RADIUS_M = 2500

# Industrial land is searched wider. A factory does not need to be walkable to
# put lorries on your road and particulates in your air.
INDUSTRY_RADIUS_M = 3500


@dataclass
class Amenities:
    """Counts and nearest distances, per kind."""

    metro_rail: int = 0
    hospitals: int = 0
    clinics: int = 0
    parks: int = 0
    markets: int = 0
    schools: int = 0
    industrial_sites: int = 0

    nearest_metro_km: Optional[float] = None
    nearest_hospital_km: Optional[float] = None
    nearest_park_km: Optional[float] = None
    nearest_industry_km: Optional[float] = None

    names: dict[str, list[str]] = field(default_factory=dict)


class OverpassError(RuntimeError):
    pass


def _query(lat: float, lon: float) -> str:
    r, ri = RADIUS_M, INDUSTRY_RADIUS_M
    # `nwr` covers nodes, ways and relations in one clause — a hospital is
    # usually a way, a bus stop always a node, and querying only nodes silently
    # loses most of the healthcare.
    # Deliberately narrow. Querying bus stops and pharmacies as well returned
    # roughly a hundred and fifty extra elements per locality and pushed Overpass
    # into 504s — and neither changes a decision the way a metro station or a
    # factory does. What is left is sparse enough to answer reliably.
    return f"""[out:json][timeout:50];
(
  nwr(around:{r},{lat},{lon})[railway=station];
  nwr(around:{r},{lat},{lon})[station=subway];
  nwr(around:{r},{lat},{lon})[amenity=hospital];
  nwr(around:{r},{lat},{lon})[amenity=clinic];
  nwr(around:{r},{lat},{lon})[leisure=park];
  nwr(around:{r},{lat},{lon})[shop=supermarket];
  nwr(around:{ri},{lat},{lon})[landuse=industrial];
);
out tags center;"""


def _classify(tags: dict[str, str]) -> Optional[str]:
    if tags.get("railway") == "station" or tags.get("station") == "subway":
        return "metro_rail"
    if tags.get("amenity") == "hospital":
        return "hospitals"
    if tags.get("amenity") == "clinic":
        return "clinics"
    if tags.get("leisure") == "park":
        return "parks"
    if tags.get("shop") == "supermarket":
        return "markets"
    if tags.get("landuse") == "industrial":
        return "industrial_sites"
    return None


class OsmAmenityClient:
    def __init__(self, timeout: float = REQUEST_TIMEOUT) -> None:
        self._client = httpx.Client(
            timeout=timeout,
            headers={"User-Agent": "NeighbourTrust/0.1 (neighbourhood data for home buyers)"},
        )

    def close(self) -> None:
        self._client.close()

    def _post(self, query: str) -> dict[str, Any]:
        """Try each endpoint, backing off. Overpass is donated infrastructure.

        A JSON decode failure is treated as a retryable error rather than a bug:
        an overloaded Overpass answers 200 with an HTML error page, so the
        symptom of being rate-limited is a parse error rather than a status code.
        """
        last: Optional[Exception] = None
        for url in ENDPOINTS:
            for attempt, wait in enumerate((0, *RETRY_WAITS)):
                if wait:
                    log.info("Overpass busy; retrying in %ss", wait)
                    time.sleep(wait)
                try:
                    response = self._client.post(url, data={"data": query})
                    if response.status_code in (429, 504):
                        last = OverpassError(f"{url} returned {response.status_code}")
                        continue
                    response.raise_for_status()
                    return response.json()
                except Exception as exc:
                    last = exc
        raise OverpassError(f"every Overpass endpoint failed: {last}")

    def around(self, lat: float, lon: float) -> Amenities:
        from agents.common.geo import haversine_km

        data = self._post(_query(lat, lon))
        found = Amenities()
        nearest: dict[str, float] = {}
        names: dict[str, list[str]] = {}

        for element in data.get("elements", []):
            tags = element.get("tags") or {}
            kind = _classify(tags)
            if kind is None:
                continue

            setattr(found, kind, getattr(found, kind) + 1)

            centre = element.get("center") or element
            elat, elon = centre.get("lat"), centre.get("lon")
            if elat is None or elon is None:
                continue
            distance = haversine_km(lat, lon, float(elat), float(elon))
            if kind not in nearest or distance < nearest[kind]:
                nearest[kind] = distance

            name = tags.get("name")
            if name and kind in ("metro_rail", "hospitals", "parks"):
                names.setdefault(kind, [])
                if name not in names[kind] and len(names[kind]) < 4:
                    names[kind].append(name)

        found.nearest_metro_km = round(nearest["metro_rail"], 2) if "metro_rail" in nearest else None
        found.nearest_hospital_km = round(nearest["hospitals"], 2) if "hospitals" in nearest else None
        found.nearest_park_km = round(nearest["parks"], 2) if "parks" in nearest else None
        found.nearest_industry_km = (
            round(nearest["industrial_sites"], 2) if "industrial_sites" in nearest else None
        )
        found.names = names
        return found
