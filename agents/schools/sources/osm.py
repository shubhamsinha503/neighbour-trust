"""School locations from OpenStreetMap via the Overpass API.

Added after UDISE was measured to be spatially incomplete in Bengaluru's urban
core — 61 OSM schools within 2 km of Indiranagar against 0 in UDISE. OSM answers
"what schools are actually here", which UDISE cannot; UDISE answers "how well
staffed is it", which OSM cannot. Both, separately, rather than one pretending to
be the other.

docs/strategy.md already names OSM as the geospatial base layer for exactly this,
and the licensing is the reason it beats the obvious alternative: OSM is ODbL, so
storing and redistributing it is explicitly permitted with attribution. Google
Places forbids retaining its content beyond ~30 days and forbids building a
derived database — which is precisely what this pipeline is.

Overpass etiquette matters here. It is donated infrastructure with no API key and
no quota to hide behind, so this fetches **one bounding box per city** and does
all per-locality work locally against Postgres, rather than firing a query per
locality per run. Two requests per refresh, not twenty-two.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Iterator, Optional

import httpx

# Public instance. Swap for a self-hosted one if this ever runs often enough to
# be rude — at a weekly cadence over two cities it is not.
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
SOURCE_NAME = "OpenStreetMap"
SOURCE_URL = "https://www.openstreetmap.org/copyright"

# (south, west, north, east) — generous enough to cover the metro area, since
# per-locality filtering happens later in PostGIS anyway.
CITY_BBOX: dict[str, tuple[float, float, float, float]] = {
    "Bengaluru": (12.75, 77.35, 13.20, 77.85),
    "Gurugram": (28.32, 76.82, 28.58, 77.20),
}

REQUEST_TIMEOUT = 180.0
RETRY_WAITS = (10, 30, 60)

log = logging.getLogger(__name__)


class OverpassError(RuntimeError):
    pass


class OsmSchoolsClient:
    def __init__(self, timeout: float = REQUEST_TIMEOUT) -> None:
        self._client = httpx.Client(
            timeout=timeout,
            # Overpass asks for a descriptive User-Agent so operators can identify
            # and contact heavy users rather than just blocking them.
            headers={"User-Agent": "NeighbourTrust/0.1 (neighbourhood data for home buyers)"},
        )

    def __enter__(self) -> "OsmSchoolsClient":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def schools_for_city(self, city: str) -> Iterator[dict[str, Any]]:
        bbox = CITY_BBOX.get(city)
        if bbox is None:
            raise OverpassError(
                f"No OSM bounding box for {city!r}. Known: {sorted(CITY_BBOX)}"
            )

        south, west, north, east = bbox
        box = f"{south},{west},{north},{east}"
        # `out center` gives ways and relations a single representative point, so
        # a school mapped as a building outline is usable alongside one mapped as
        # a node.
        query = f"""
            [out:json][timeout:120];
            (
              node["amenity"="school"]({box});
              way["amenity"="school"]({box});
              relation["amenity"="school"]({box});
            );
            out center tags;
        """

        payload = self._post(query)
        parsed_records = []
        dropped = 0

        for element in payload.get("elements", []):
            parsed = _parse(element)
            if parsed is None:
                dropped += 1
                continue
            parsed_records.append(parsed)

        deduped = _dedupe(parsed_records)
        log.info(
            "OSM %s: %d schools kept, %d dropped, %d merged as duplicates",
            city, len(deduped), dropped, len(parsed_records) - len(deduped),
        )
        yield from deduped

    def _post(self, query: str) -> dict[str, Any]:
        """POST with backoff. Overpass answers 429/504 under load routinely, and
        those are "come back shortly", not failures."""
        last_error: Optional[Exception] = None

        for attempt, wait in enumerate((0, *RETRY_WAITS)):
            if wait:
                log.info("Overpass busy; retrying in %ss", wait)
                time.sleep(wait)
            try:
                response = self._client.post(OVERPASS_URL, data={"data": query})
                if response.status_code in (429, 504):
                    last_error = OverpassError(f"Overpass returned {response.status_code}")
                    continue
                response.raise_for_status()
                return response.json()
            except (httpx.TimeoutException, httpx.HTTPError) as exc:
                last_error = exc

        raise OverpassError(f"Overpass failed after {len(RETRY_WAITS) + 1} attempts: {last_error}")


def _parse(element: dict[str, Any]) -> Optional[dict[str, Any]]:
    """One Overpass element to our school shape, or None if unusable."""
    tags = element.get("tags") or {}

    lat = element.get("lat")
    lon = element.get("lon")
    if lat is None or lon is None:
        centre = element.get("center") or {}
        lat, lon = centre.get("lat"), centre.get("lon")
    if lat is None or lon is None:
        return None

    name = (tags.get("name") or tags.get("official_name") or "").strip()
    if not name:
        # An unnamed school still counts as a school being present, so it is kept
        # for the count with an honest placeholder rather than discarded.
        name = "Unnamed school"

    osm_type = element.get("type") or "node"
    osm_id = element.get("id")
    if osm_id is None:
        return None

    return {
        "external_id": f"{osm_type}/{osm_id}",
        "name": name,
        "lat": float(lat),
        "lon": float(lon),
        # OSM's tagging vocabulary, mapped onto the fields we already have. Most
        # OSM school entries carry little beyond a name and a point.
        "school_category": tags.get("isced:level") or tags.get("school:type") or None,
        "management": _management(tags),
        "board_secondary": tags.get("school:board") or None,
        "pincode": (tags.get("addr:postcode") or "").strip() or None,
        # Everything below is genuinely absent from OSM. Left as None rather than
        # zero: a school with no recorded teacher count must not read as a school
        # with no teachers.
        "school_type": None,
        "board_higher_sec": None,
        "year_established": None,
        "class_from": None,
        "class_to": None,
        "total_teachers": None,
        "total_students": None,
        "class_rooms": None,
        "other_rooms": None,
    }


def _management(tags: dict[str, str]) -> Optional[str]:
    """OSM's operator:type, translated into UDISE-ish wording so the two sources
    describe management the same way on the card."""
    operator_type = (tags.get("operator:type") or "").strip().lower()
    return {
        "government": "Government",
        "public": "Government",
        "private": "Private",
        "religious": "Private (religious)",
        "ngo": "Private (NGO)",
        "community": "Community",
    }.get(operator_type)


# Two OSM entries within this distance sharing a name are treated as one school.
# Mappers routinely record a school as both a node and a building outline, and
# large campuses get an entry per block. 150 m is wide enough to catch those and
# tight enough not to merge two genuinely different schools on the same road.
DUPLICATE_RADIUS_M = 150


def _dedupe(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse duplicate mappings of the same school.

    This matters beyond tidiness: the school *count* is the headline number on
    the card, and counting one school three times because a mapper drew it as a
    node, a building and a campus boundary inflates exactly the figure a buyer
    reads first.

    Unnamed entries are never merged — with no name to compare, proximity alone
    cannot distinguish "the same school mapped twice" from "two schools on the
    same street".
    """
    from agents.common.geo import haversine_km

    kept: list[dict[str, Any]] = []
    for record in records:
        key = _normalise_name(record["name"])
        if key is None:
            kept.append(record)
            continue

        duplicate = False
        for existing in kept:
            if _normalise_name(existing["name"]) != key:
                continue
            metres = haversine_km(
                record["lat"], record["lon"], existing["lat"], existing["lon"]
            ) * 1000
            if metres <= DUPLICATE_RADIUS_M:
                duplicate = True
                break
        if not duplicate:
            kept.append(record)

    return kept


def _normalise_name(name: str) -> Optional[str]:
    text = name.strip().lower()
    if not text or text == "unnamed school":
        return None
    for noise in (" school", " vidyalaya", " vidyalya", ".", ",", "'", "-"):
        text = text.replace(noise, " ")
    return " ".join(text.split()) or None
