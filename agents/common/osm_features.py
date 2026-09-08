"""One read of an OpenStreetMap extract, shared by every agent that needs it.

Two agents want features out of the same two regional files. The connectivity
agent wants stations, hospitals, parks, shops and industrial land; the schools
agent wants schools. Each was reading the whole extract for itself, which meant
parsing 750 MB twice a week to answer questions one pass could answer together.

The cost is not in finding the features. It is in placing them. A school or a
hospital is usually a building outline rather than a point, so its position has
to be computed from the nodes of its way — and a campus mapped as a multipolygon
needs its member ways resolved first. Measured on the southern extract:

    pass 1  find tagged features          17s
    pass 2  resolve 222 relation members  179s
    pass 3  resolve 118,156 node ids      ~250s

Passes 2 and 3 each scan the entire file, and their cost barely moves with how
much you ask for — three minutes to resolve 222 ways is the same three minutes
whether you also wanted schools or not. So asking for everything at once is very
nearly free, and asking twice costs double.

Hence this module: one selector list, one read, and a cache on disk so the
second agent to run pays nothing at all.

**Empty is never a valid answer here.** A caller that gets no features must
treat it as a failed read, not as a region with nothing in it. That distinction
is what the whole product rests on and it has been got wrong before, by an
Overpass mirror that answered with an HTML error page and by another that only
carried Switzerland.
"""

from __future__ import annotations

import gzip
import json
import logging
import pathlib
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, Optional

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

# Every key/value pair any agent needs, in one filter. Adding a consumer means
# adding its pairs here rather than adding a second read of the file.
SELECTORS: tuple[tuple[str, str], ...] = (
    # Connectivity
    ("railway", "station"),
    ("station", "subway"),
    ("amenity", "hospital"),
    ("amenity", "clinic"),
    ("leisure", "park"),
    ("shop", "supermarket"),
    ("landuse", "industrial"),
    # Schools
    ("amenity", "school"),
)

# Only these tags are carried through to the cache. The full tag set of 80,000
# features is mostly addresses and mapper notes; this is what the agents read.
KEEP_TAGS = (
    "railway", "station", "amenity", "leisure", "shop", "landuse",
    "name", "official_name",
    "isced:level", "school:type", "operator:type", "school:board",
    "addr:postcode",
)

# Bumped when the shape of a cached record changes, so an old cache is rebuilt
# rather than misread.
CACHE_VERSION = 1


class ExtractError(RuntimeError):
    pass


@dataclass(frozen=True)
class Feature:
    """One placed OpenStreetMap feature."""

    osm_type: str          # node | way | relation
    osm_id: int
    lat: float
    lon: float
    tags: dict[str, str]

    @property
    def external_id(self) -> str:
        return f"{self.osm_type}/{self.osm_id}"


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


def _kept_tags(tags: dict[str, str]) -> dict[str, str]:
    return {k: v for k, v in tags.items() if k in KEEP_TAGS}


def parse_extract(path: pathlib.Path) -> list[Feature]:
    """Three passes over one file, yielding every selected feature, placed.

    A single pass would need a node-location index for the whole extract, which
    is gigabytes. This resolves only the node ids the matched features name —
    a hundred thousand or so rather than sixty million.
    """
    started = time.time()
    features: list[Feature] = []
    # (tags, osm_type, osm_id, node_refs) for ways and relations alike;
    # relations start with an empty ref list that pass 2 fills in.
    pending: list[tuple[dict[str, str], str, int, list[int]]] = []
    members: dict[int, list[int]] = {}
    wanted_ways: set[int] = set()
    wanted_refs: set[int] = set()

    for obj in osmium.FileProcessor(str(path)).with_filter(
        osmium.filter.TagFilter(*SELECTORS)
    ):
        tags = _kept_tags(dict(obj.tags))
        if obj.is_node():
            features.append(
                Feature("node", obj.id, obj.location.lat, obj.location.lon, tags)
            )
        elif obj.is_way():
            refs = [n.ref for n in obj.nodes]
            if refs:
                pending.append((tags, "way", obj.id, refs))
                wanted_refs.update(refs)
        else:
            ways = [m.ref for m in obj.members if m.type == "w"]
            if ways:
                index = len(pending)
                pending.append((tags, "relation", obj.id, []))
                for way_id in ways:
                    members.setdefault(way_id, []).append(index)
                    wanted_ways.add(way_id)
    log.debug("pass 1: %.0fs", time.time() - started)

    if wanted_ways:
        for obj in osmium.FileProcessor(str(path), osmium.osm.WAY):
            if obj.id in wanted_ways:
                refs = [n.ref for n in obj.nodes]
                wanted_refs.update(refs)
                for index in members[obj.id]:
                    pending[index][3].extend(refs)

    locations: dict[int, tuple[float, float]] = {}
    for obj in osmium.FileProcessor(str(path), osmium.osm.NODE):
        if obj.id in wanted_refs:
            locations[obj.id] = (obj.location.lat, obj.location.lon)

    unplaced = 0
    for tags, osm_type, osm_id, refs in pending:
        points = [locations[r] for r in refs if r in locations]
        if not points:
            # A feature whose nodes fall outside this extract's cut. Placing it
            # at a guessed coordinate would be worse than not counting it.
            unplaced += 1
            continue
        features.append(Feature(
            osm_type, osm_id,
            sum(p[0] for p in points) / len(points),
            sum(p[1] for p in points) / len(points),
            tags,
        ))

    log.info(
        "Parsed %s: %s features in %.0fs%s",
        path.name, f"{len(features):,}", time.time() - started,
        f" ({unplaced} unplaced)" if unplaced else "",
    )
    return features


def _cache_path(cache_dir: pathlib.Path, name: str) -> pathlib.Path:
    return cache_dir / f"{name}.features.jsonl.gz"


def _save_cache(path: pathlib.Path, features: list[Feature], vintage: Optional[datetime]) -> None:
    tmp = path.with_suffix(".tmp")
    with gzip.open(tmp, "wt", encoding="utf-8") as handle:
        handle.write(json.dumps({
            "version": CACHE_VERSION,
            "vintage": vintage.isoformat() if vintage else None,
            "count": len(features),
        }) + "\n")
        for f in features:
            handle.write(json.dumps(
                [f.osm_type, f.osm_id, f.lat, f.lon, f.tags],
                separators=(",", ":"),
            ) + "\n")
    tmp.replace(path)


def _load_cache(
    path: pathlib.Path, vintage: Optional[datetime]
) -> Optional[list[Feature]]:
    if not path.exists():
        return None
    try:
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            header = json.loads(handle.readline())
            if header.get("version") != CACHE_VERSION:
                return None
            # A cache built from a different snapshot describes a different map.
            cached_vintage = header.get("vintage")
            want = vintage.isoformat() if vintage else None
            if cached_vintage != want:
                return None
            features = [
                Feature(row[0], row[1], row[2], row[3], row[4])
                for row in (json.loads(line) for line in handle if line.strip())
            ]
    except (OSError, ValueError, KeyError, IndexError) as exc:
        log.info("Ignoring unreadable feature cache %s: %s", path.name, exc)
        return None

    if not features:
        # An empty cache is indistinguishable from a region with nothing in it,
        # and that is the one thing this codebase must never conflate.
        return None
    return features


def features_for(
    name: str,
    *,
    cache_dir: pathlib.Path = DEFAULT_CACHE,
    path: Optional[pathlib.Path] = None,
    use_cache: bool = True,
) -> list[Feature]:
    """Every selected feature in one extract, parsed once and then cached.

    The cache is what makes the sharing real across separately scheduled jobs:
    the connectivity run parses the file, and the schools run — a different
    process, possibly hours later — reads the result in seconds.
    """
    pbf = path if path is not None else download_extract(name, cache_dir=cache_dir)
    vintage = snapshot_time(pbf)
    cache_file = _cache_path(cache_dir, name)

    if use_cache:
        cached = _load_cache(cache_file, vintage)
        if cached is not None:
            log.info("Loaded %s features for %s from cache", f"{len(cached):,}", name)
            return cached

    features = parse_extract(pbf)
    if not features:
        raise ExtractError(f"no features parsed from {pbf}")

    if use_cache:
        try:
            cache_dir.mkdir(parents=True, exist_ok=True)
            _save_cache(cache_file, features, vintage)
        except OSError as exc:
            # A cache that cannot be written is a slower next run, not a failure.
            log.info("Could not write feature cache: %s", exc)

    return features


def select(features: Iterable[Feature], key: str, value: str) -> list[Feature]:
    """Features carrying one key=value pair."""
    return [f for f in features if f.tags.get(key) == value]


def vintage_for(
    name: str,
    *,
    cache_dir: pathlib.Path = DEFAULT_CACHE,
    path: Optional[pathlib.Path] = None,
) -> Optional[datetime]:
    pbf = path if path is not None else download_extract(name, cache_dir=cache_dir)
    return snapshot_time(pbf)
