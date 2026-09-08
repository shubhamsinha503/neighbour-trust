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
from datetime import datetime
from dataclasses import dataclass, field
from typing import Any, Iterable, Optional, Sequence

from agents.common import osm_features

log = logging.getLogger(__name__)

# Re-exported so callers and tests keep their existing import sites.
SOURCE_NAME = osm_features.SOURCE_NAME
SOURCE_URL = osm_features.SOURCE_URL
EXTRACTS = osm_features.EXTRACTS
DEFAULT_CACHE = osm_features.DEFAULT_CACHE
ExtractError = osm_features.ExtractError
download_extract = osm_features.download_extract
snapshot_time = osm_features.snapshot_time

# How far counts as "nearby" for a walkable amenity. Two and a half kilometres is
# a short auto ride rather than a walk, which is how these are actually reached
# in Bengaluru and Gurugram.
RADIUS_M = 2500

# Industrial land is searched wider. A factory does not need to be walkable to
# put lorries on your road and particulates in your air.
INDUSTRY_RADIUS_M = 3500

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

    # Every matched feature as {kind, lat, lon, name}. Kept so a distance can be
    # re-measured from an address the reader gives us: "nearest station 0.2 km"
    # is measured from the locality centroid, which is a point standing in for
    # an area two or three kilometres across, and the station nearest that point
    # is often not the station nearest their flat.
    features: list[dict[str, Any]] = field(default_factory=list)


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


def _pois_from(features: Iterable[Any]) -> list[tuple[str, float, float, Optional[str]]]:
    """Shared features narrowed to the kinds this card shows."""
    out = []
    for f in features:
        kind = classify(f.tags)
        if kind is not None:
            out.append((kind, f.lat, f.lon, f.tags.get("name")))
    return out


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
            # The shared reader parses once and caches, so whichever agent
            # runs second — schools or this one — pays nothing for the file.
            names = list(extracts if extracts is not None else EXTRACTS)
            for name in names:
                stamp = osm_features.vintage_for(name, cache_dir=cache_dir)
                if stamp is not None:
                    self._vintages.append(stamp)
                self._pois.extend(_pois_from(
                    osm_features.features_for(name, cache_dir=cache_dir)
                ))
            files = []

        for path in files:
            stamp = snapshot_time(path)
            if stamp is not None:
                self._vintages.append(stamp)
            self._pois.extend(_pois_from(osm_features.parse_extract(path)))

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

            found.features.append(
                {"kind": kind, "lat": round(plat, 6), "lon": round(plon, 6),
                 "name": name}
            )

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
