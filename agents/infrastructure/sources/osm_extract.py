"""What is actually built around a locality, read from a local OpenStreetMap extract.

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

**Why a file rather than an API.** This category was served by the Overpass API
and it never finished a run. Overpass is donated infrastructure maintained by
volunteers; forty-four radius queries is both rude and unreliable, and our best
pass covered 3 of 44 localities. The failure that decided it was not the
timeouts but an overloaded mirror answering HTTP 200 with an HTML error page,
which a JSON parser turns into "this locality has no hospitals" — a wrong answer
wearing the costume of a right one.

Overpass is a query layer over data anyone may download. So we download it.
Geofabrik publishes regional extracts rebuilt daily; two of them cover both
launch cities. Measured on this machine: 41 of 44 localities answered in about
eight minutes, with no network access during the run and identical results on a
re-run. The three that fall short — Manesar, Gurugram Sector 82 and Sector 102 —
are genuine gaps in OpenStreetMap's coverage of outer Gurugram, which Overpass
also returned nothing for, and which `agent.MIN_FEATURES_FOR_DATA` reports as
unmapped rather than as empty.

**Three passes, not one.** A single pass needs a node-location index for the
whole extract, which is gigabytes. Instead pass 1 collects the features we want,
pass 2 resolves the member ways of multipolygon relations, and pass 3 looks up
only the node ids those two passes asked for — a few hundred thousand rather
than sixty million.

Relations are resolved rather than skipped. Skipping them was the first version
and it silently dropped 114 industrial sites, 96 parks and 60 hospitals across
the two regions. The measured effect turned out to be small (+1.7% on industrial
sites), but industrial land is the one signal on this card that *subtracts*, so
missing one makes a locality look better than it is. That is the direction of
error worth spending twenty seconds a run to avoid.
"""

from __future__ import annotations

import logging
import math
import pathlib
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterable, Optional, Sequence

import httpx
import osmium

log = logging.getLogger(__name__)

SOURCE_NAME = "OpenStreetMap"
SOURCE_URL = "https://www.openstreetmap.org/copyright"

# Geofabrik rebuilds these daily. Between them they cover both launch cities;
# adding a city means adding its zone here.
EXTRACTS: dict[str, str] = {
    "southern-zone": "https://download.geofabrik.de/asia/india/southern-zone-latest.osm.pbf",
    "northern-zone": "https://download.geofabrik.de/asia/india/northern-zone-latest.osm.pbf",
}

DEFAULT_CACHE = pathlib.Path(".cache/osm")

# How far counts as "nearby" for a walkable amenity. Two and a half kilometres is
# a short auto ride rather than a walk, which is how these are actually reached
# in Bengaluru and Gurugram.
RADIUS_M = 2500

# Industrial land is searched wider. A factory does not need to be walkable to
# put lorries on your road and particulates in your air.
INDUSTRY_RADIUS_M = 3500

# Only these keys are worth decoding; everything else in the extract is skipped
# before its tags are read.
KEYS = ("railway", "station", "amenity", "leisure", "shop", "landuse")

# Names are kept only where the card actually shows them.
NAMED_KINDS = ("metro_rail", "hospitals", "parks")


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


class ExtractError(RuntimeError):
    pass


def classify(tags: dict[str, str]) -> Optional[str]:
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


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def download_extract(
    name: str, cache_dir: pathlib.Path = DEFAULT_CACHE, max_age_hours: float = 24.0
) -> pathlib.Path:
    """Fetch one Geofabrik extract, reusing a recent copy if there is one.

    These are hundreds of megabytes and rebuilt once a day, so re-downloading
    within the day buys nothing and spends someone else's bandwidth.
    """
    url = EXTRACTS.get(name)
    if url is None:
        raise ExtractError(f"unknown extract {name!r}; known: {sorted(EXTRACTS)}")

    cache_dir.mkdir(parents=True, exist_ok=True)
    dest = cache_dir / f"{name}.osm.pbf"

    if dest.exists():
        age_hours = (time.time() - dest.stat().st_mtime) / 3600
        if age_hours < max_age_hours:
            log.info(
                "Using cached %s (%.1fh old, %.0f MB)",
                name, age_hours, dest.stat().st_size / 1e6,
            )
            return dest

    log.info("Downloading %s from Geofabrik", name)
    partial = dest.with_suffix(".partial")
    # Written to a temporary name and moved into place, so an interrupted
    # download cannot leave a truncated file that later reads as a valid but
    # half-empty map.
    with httpx.stream("GET", url, follow_redirects=True, timeout=120.0) as response:
        response.raise_for_status()
        with partial.open("wb") as handle:
            for chunk in response.iter_bytes(chunk_size=1024 * 1024):
                handle.write(chunk)
    partial.replace(dest)
    log.info("Downloaded %s (%.0f MB)", name, dest.stat().st_size / 1e6)
    return dest


def snapshot_time(path: pathlib.Path) -> Optional[datetime]:
    """When OpenStreetMap was actually sampled, from the extract's own header.

    Worth reading rather than stamping `now`: the Overpass path had no way to
    know this and recorded the fetch time as the data vintage, which overstated
    freshness by however long the extract had been sitting.
    """
    stamp = osmium.FileProcessor(str(path)).header.get("osmosis_replication_timestamp")
    if not stamp:
        return None
    return datetime.fromisoformat(stamp.replace("Z", "+00:00")).astimezone(timezone.utc)


def _read_extract(path: pathlib.Path) -> list[tuple[str, float, float, Optional[str]]]:
    """Every feature we care about, as (kind, lat, lon, name)."""
    pois: list[tuple[str, float, float, Optional[str]]] = []
    # [kind, name, node_refs] for ways and relations alike; relations start with
    # an empty ref list that pass 2 fills in.
    pending: list[list[Any]] = []
    members: dict[int, list[int]] = {}
    wanted_ways: set[int] = set()
    wanted_refs: set[int] = set()

    started = time.time()
    for obj in osmium.FileProcessor(str(path)).with_filter(osmium.filter.KeyFilter(*KEYS)):
        kind = classify(dict(obj.tags))
        if kind is None:
            continue
        name = obj.tags.get("name")
        if obj.is_node():
            pois.append((kind, obj.location.lat, obj.location.lon, name))
        elif obj.is_way():
            refs = [n.ref for n in obj.nodes]
            if refs:
                pending.append([kind, name, refs])
                wanted_refs.update(refs)
        else:
            ways = [m.ref for m in obj.members if m.type == "w"]
            if ways:
                index = len(pending)
                pending.append([kind, name, []])
                for way_id in ways:
                    members.setdefault(way_id, []).append(index)
                    wanted_ways.add(way_id)

    if wanted_ways:
        for obj in osmium.FileProcessor(str(path), osmium.osm.WAY):
            if obj.id in wanted_ways:
                refs = [n.ref for n in obj.nodes]
                wanted_refs.update(refs)
                for index in members[obj.id]:
                    pending[index][2].extend(refs)

    locations: dict[int, tuple[float, float]] = {}
    for obj in osmium.FileProcessor(str(path), osmium.osm.NODE):
        if obj.id in wanted_refs:
            locations[obj.id] = (obj.location.lat, obj.location.lon)

    unplaced = 0
    for kind, name, refs in pending:
        points = [locations[r] for r in refs if r in locations]
        if not points:
            # A way whose nodes fall outside this extract's cut. Counting it at
            # a guessed position would be worse than not counting it.
            unplaced += 1
            continue
        pois.append((
            kind,
            sum(p[0] for p in points) / len(points),
            sum(p[1] for p in points) / len(points),
            name,
        ))

    log.info(
        "Read %s: %s features in %.0fs%s",
        path.name, f"{len(pois):,}", time.time() - started,
        f" ({unplaced} unplaced)" if unplaced else "",
    )
    return pois


class OsmExtractClient:
    """Answers `around()` from local extracts.

    Deliberately the same shape as the Overpass client it replaces, so the agent
    and its tests did not have to change to accommodate a new data path.
    """

    def __init__(
        self,
        extracts: Optional[Sequence[str]] = None,
        *,
        cache_dir: pathlib.Path = DEFAULT_CACHE,
        paths: Optional[Sequence[pathlib.Path]] = None,
    ) -> None:
        self._pois: list[tuple[str, float, float, Optional[str]]] = []
        self._vintages: list[datetime] = []

        files: Iterable[pathlib.Path]
        if paths is not None:
            files = [pathlib.Path(p) for p in paths]
        else:
            files = [
                download_extract(name, cache_dir=cache_dir)
                for name in (extracts if extracts is not None else EXTRACTS)
            ]

        for path in files:
            stamp = snapshot_time(path)
            if stamp is not None:
                self._vintages.append(stamp)
            self._pois.extend(_read_extract(path))

        if not self._pois:
            raise ExtractError("no features read from any extract")

    @property
    def data_vintage(self) -> Optional[datetime]:
        """The oldest snapshot in play — the honest age of the combined answer."""
        return min(self._vintages) if self._vintages else None

    def close(self) -> None:
        self._pois.clear()

    def around(self, lat: float, lon: float) -> Amenities:
        found = Amenities()
        nearest: dict[str, float] = {}
        names: dict[str, list[str]] = {}

        # A cheap rectangular reject before the trigonometry. One degree of
        # latitude is ~111 km everywhere; longitude shrinks with the cosine.
        pad_lat = (INDUSTRY_RADIUS_M / 1000) / 111.0
        pad_lon = pad_lat / max(math.cos(math.radians(lat)), 0.01)

        for kind, plat, plon, name in self._pois:
            if abs(plat - lat) > pad_lat or abs(plon - lon) > pad_lon:
                continue
            distance = haversine_km(lat, lon, plat, plon)
            limit = INDUSTRY_RADIUS_M if kind == "industrial_sites" else RADIUS_M
            if distance * 1000 > limit:
                continue

            setattr(found, kind, getattr(found, kind) + 1)
            if kind not in nearest or distance < nearest[kind]:
                nearest[kind] = distance

            if name and kind in NAMED_KINDS:
                names.setdefault(kind, [])
                if name not in names[kind] and len(names[kind]) < 4:
                    names[kind].append(name)

        found.nearest_metro_km = (
            round(nearest["metro_rail"], 2) if "metro_rail" in nearest else None
        )
        found.nearest_hospital_km = (
            round(nearest["hospitals"], 2) if "hospitals" in nearest else None
        )
        found.nearest_park_km = round(nearest["parks"], 2) if "parks" in nearest else None
        found.nearest_industry_km = (
            round(nearest["industrial_sites"], 2) if "industrial_sites" in nearest else None
        )
        found.names = names
        return found
