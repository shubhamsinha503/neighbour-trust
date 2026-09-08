"""School locations from OpenStreetMap, read from a local regional extract.

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

**Why a file rather than the Overpass API.** This fetched one bounding box per
city, which was already polite — two requests a run rather than one per locality
— so it was never the per-locality hammering that broke the connectivity agent.
It had two narrower problems instead.

The first is that a bounding box big enough to matter is a query big enough to
fail. Overpass answers a large box with 504s under load, and the box here was
sized to what Overpass would tolerate rather than to where people actually live.
Widening it to cover more of either metro meant a slower query and a worse
failure rate, so coverage was capped by the transport rather than by the data.

The second is that it was a single hardcoded endpoint with no fallback, and when
it went busy the run lost OSM entirely and degraded to UDISE-only counts.

The extract removes both. It is already downloaded for the connectivity agent,
so this costs nothing extra, and the bounding boxes below are now free to be as
generous as the cities require — they filter a file we already hold rather than
sizing a request someone else has to serve.
"""

from __future__ import annotations

import logging
import pathlib
import time
from typing import Any, Iterator, Optional

from agents.common import osm_features

SOURCE_NAME = "OpenStreetMap"
SOURCE_URL = "https://www.openstreetmap.org/copyright"

# (south, west, north, east) — the metro area each city's schools are drawn
# from. Per-locality filtering happens later in PostGIS anyway, so these only
# have to be generous rather than precise.
#
# They can now be widened without penalty. Under Overpass every extra square
# kilometre was another chance of a 504; against a local file the cost of a
# bigger box is a slightly longer loop over records already in memory.
CITY_BBOX: dict[str, tuple[float, float, float, float]] = {
    "Bengaluru": (12.70, 77.30, 13.25, 77.90),
    "Gurugram": (28.25, 76.75, 28.65, 77.25),
}

# Which regional extract covers each city.
CITY_EXTRACT: dict[str, str] = {
    "Bengaluru": "southern-zone",
    "Gurugram": "northern-zone",
}

log = logging.getLogger(__name__)


class OverpassError(RuntimeError):
    """Kept under its old name so callers catching it still catch it.

    agents/schools/job.py treats a failure here as non-fatal and degrades to
    UDISE-only counts. Renaming the exception would have quietly turned that
    into an unhandled error on the first bad run.
    """


def _in_box(lat: float, lon: float, box: tuple[float, float, float, float]) -> bool:
    south, west, north, east = box
    return south <= lat <= north and west <= lon <= east


class OsmSchoolsClient:
    """Same interface as the Overpass client it replaces.

    `schools_for_city` still yields the same record shape, so the agent and its
    ingest path did not change.
    """

    def __init__(
        self,
        timeout: float = 0.0,  # accepted and unused; kept so callers need no edit
        *,
        cache_dir: pathlib.Path = osm_features.DEFAULT_CACHE,
        paths: Optional[dict[str, pathlib.Path]] = None,
    ) -> None:
        self._cache_dir = cache_dir
        self._paths = paths or {}
        # Extract name -> parsed schools, so two cities sharing a region read the
        # file once.
        self._by_extract: dict[str, list[dict[str, Any]]] = {}

    def __enter__(self) -> "OsmSchoolsClient":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    def close(self) -> None:
        self._by_extract.clear()

    def _extract_path(self, name: str) -> pathlib.Path:
        if name in self._paths:
            return self._paths[name]
        return osm_features.download_extract(name, cache_dir=self._cache_dir)

    def _schools_in(self, extract_name: str) -> list[dict[str, Any]]:
        if extract_name not in self._by_extract:
            features = osm_features.features_for(
                extract_name,
                cache_dir=self._cache_dir,
                path=self._paths.get(extract_name),
            )
            self._by_extract[extract_name] = _schools_from(features)
        return self._by_extract[extract_name]

    def data_vintage(self, city: str):
        """When OpenStreetMap was sampled, from the extract's own header."""
        name = CITY_EXTRACT.get(city)
        if name is None:
            return None
        return osm_features.snapshot_time(self._extract_path(name))

    def schools_for_city(self, city: str) -> Iterator[dict[str, Any]]:
        box = CITY_BBOX.get(city)
        extract_name = CITY_EXTRACT.get(city)
        if box is None or extract_name is None:
            raise OverpassError(
                f"No OSM extract configured for {city!r}. Known: {sorted(CITY_BBOX)}"
            )

        try:
            everything = self._schools_in(extract_name)
        except Exception as exc:
            # Wrapped so job.py's existing non-fatal handling still applies: a
            # missing or unreadable extract degrades this run to UDISE rather
            # than failing the whole schools job.
            raise OverpassError(f"could not read {extract_name}: {exc}") from exc

        in_city = [r for r in everything if _in_box(r["lat"], r["lon"], box)]
        deduped = _dedupe(in_city)
        log.info(
            "OSM %s: %d schools kept, %d merged as duplicates (from %d in %s)",
            city, len(deduped), len(in_city) - len(deduped), len(everything),
            extract_name,
        )
        yield from deduped


def _schools_from(features: list[Any]) -> list[dict[str, Any]]:
    """The school records among a shared feature list."""
    out: list[dict[str, Any]] = []
    for f in features:
        if f.tags.get("amenity") != "school":
            continue
        record = _record(f.tags, f.osm_type, f.osm_id, f.lat, f.lon)
        if record:
            out.append(record)
    return out


def _read_schools(path: pathlib.Path) -> list[dict[str, Any]]:
    """Every amenity=school in one extract, via the shared reader.

    The parsing itself lives in agents/common/osm_features because the
    connectivity agent needs the same three passes over the same file. Passes 2
    and 3 each scan the whole extract and their cost barely moves with how much
    is asked for, so asking for schools and amenities together is very nearly
    free while asking separately costs double.
    """
    return _schools_from(osm_features.parse_extract(path))


def _record(
    tags: dict[str, str], osm_type: str, osm_id: int, lat: float, lon: float
) -> Optional[dict[str, Any]]:
    """One OSM feature as our school shape, or None if unusable."""
    if osm_id is None:
        return None

    name = (tags.get("name") or tags.get("official_name") or "").strip()
    if not name:
        # An unnamed school still counts as a school being present, so it is kept
        # for the count with an honest placeholder rather than discarded.
        name = "Unnamed school"

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
    by_name: dict[str, list[dict[str, Any]]] = {}

    for record in records:
        key = _normalise_name(record["name"])
        if key is None:
            kept.append(record)
            continue

        duplicate = False
        # Only same-named records are candidates, so this compares against a
        # handful rather than every school in the city. The previous version
        # scanned the whole kept list per record, which was fine at Overpass's
        # bounding box and quadratic at a region's worth of schools.
        for existing in by_name.get(key, ()):
            metres = haversine_km(
                record["lat"], record["lon"], existing["lat"], existing["lon"]
            ) * 1000
            if metres <= DUPLICATE_RADIUS_M:
                duplicate = True
                break
        if not duplicate:
            kept.append(record)
            by_name.setdefault(key, []).append(record)

    return kept


def _normalise_name(name: str) -> Optional[str]:
    text = name.strip().lower()
    if not text or text == "unnamed school":
        return None
    for noise in (" school", " vidyalaya", " vidyalya", ".", ",", "'", "-"):
        text = text.replace(noise, " ")
    return " ".join(text.split()) or None
