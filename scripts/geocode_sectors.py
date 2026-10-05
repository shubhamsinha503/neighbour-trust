"""Geocode a city's numbered sectors into seed rows.

Why this exists. `scripts/propose_localities` reads named `place=` nodes from an
OpenStreetMap extract, which works beautifully for Delhi's colonies but barely at
all for Noida: a sector-planned city records its sectors as plot boundaries, not
as named place points, so a Noida run proposed eight localities where the city
has a hundred and sixty-odd. Yet "Sector 62" is exactly how a Noida buyer
searches. This fills that gap from the other direction: it generates the sector
names and asks a geocoder where each one is, keeping only the ones that resolve
to a real area inside the city.

Same honesty bar as scripts/geocode_localities, with one addition that matters
for sector-planned cities. A result is kept only when Nominatim returns an area
record whose own name is exactly "Sector N", inside the city's box, and far
enough from everything already seeded not to be a duplicate or an H3-cell
collision. Everything else is dropped rather than guessed.

An area record here is a `place`/`boundary` settlement (as in geocode_localities)
*or* a `landuse` polygon named exactly "Sector N". The landuse case is what
unlocks a sector city: Noida records almost none of its sectors as named `place`
nodes — querying "Sector 15, Noida" returns either a `landuse=residential`
polygon literally named "Sector 15" (a real, mapped sector boundary) or, for the
sectors OSM has not mapped at all, the Sector 18 centroid as a fuzzy fallback.
The exact-name guard keeps the former and rejects the latter, so accepting an
exact-named landuse polygon adds genuinely-located sectors without admitting a
single centroid guess. A landuse polygon that merely *contains* a sector but is
named something else never matches, exactly as before.

    python -m scripts.geocode_sectors --city Noida            # dry, prints a table
    python -m scripts.geocode_sectors --city Noida --write    # append to the seed file
    python -m scripts.geocode_sectors --city Noida --max 168  # sector range to try

Nothing here touches the database. With --write it appends rows to
agents/common/seed_localities.py for review in a diff, exactly like
propose_localities --write. Re-runnable: sectors already in the seed file (by
slug or by proximity) are skipped, so a second run only adds what is new.
"""

from __future__ import annotations

import argparse
import pathlib
import re
import sys
import time
from typing import Any, Optional

import httpx
from dotenv import load_dotenv

load_dotenv(pathlib.Path(__file__).resolve().parents[1] / ".env")

from agents.common.geo import cell_for, haversine_km  # noqa: E402
from scripts.geocode_localities import CITY_BOX, _is_place  # noqa: E402
from scripts.propose_localities import (  # noqa: E402
    CITIES,
    SAME_PLACE_KM,
    existing_localities,
    slug_for,
)

# Nominatim asks for a real User-Agent and at most one request a second. A shared
# egress IP gets throttled harder than that, so pace well under the limit and back
# off on the 429s that still happen.
UA = "NeighbourTrust/0.1 (neighbourhood data for home buyers; sector geocoding)"
SECONDS_BETWEEN_REQUESTS = 2.0
RATE_LIMIT_RETRIES = 3
RATE_LIMIT_BACKOFF = 5.0  # seconds, doubled each retry

# How many sectors to try by default. Noida runs to ~168; most cities fewer. A
# gap in the numbering is normal and simply yields no result for that number.
DEFAULT_MAX_SECTOR = 168


def _box_for(city: str) -> tuple[float, float, float, float]:
    box = CITY_BOX.get(city)
    if box is None:
        raise SystemExit(
            f"No bounding box for {city!r}. Known: {sorted(CITY_BOX)}. "
            f"Add it to scripts/geocode_localities.CITY_BOX first."
        )
    return box


def _in_box(lat: float, lon: float, box: tuple[float, float, float, float]) -> bool:
    min_lon, min_lat, max_lon, max_lat = box
    return min_lat <= lat <= max_lat and min_lon <= lon <= max_lon


# A sector is mapped either as a settlement node (`place`/`boundary`, accepted by
# geocode_localities._is_place) or — far more often in Noida — as a `landuse`
# polygon named "Sector N". Both describe the sector's extent; neither is a
# feature standing inside it. This is only ever reached together with
# _names_exact_sector, so a landuse polygon named anything but "Sector N" (the
# surrounding village, a stray plot) is still rejected and cannot stand in.
_SECTOR_LANDUSE_TYPES = ("residential", "commercial", "industrial")


def _is_sector_area(hit: dict) -> bool:
    """A record that describes a sector's extent, not something standing in it."""
    if _is_place(hit):
        return True
    return hit.get("class") == "landuse" and hit.get("type") in _SECTOR_LANDUSE_TYPES


def _names_exact_sector(hit: dict, n: int) -> bool:
    """True only if the result is actually "Sector N", not a fuzzy neighbour.

    Nominatim answers a bounded "Sector 3, Noida" with the nearest thing it can
    match — in practice often another sector ("Sector 18") or the city centroid
    ("Noida"). Both look confident and both place the locality wrong. The guard:
    the matched area's own name must be exactly "Sector N". addressdetails gives
    the component name directly; the display_name prefix is the fallback.
    """
    addr = hit.get("address") or {}
    target = f"sector {n}"
    for key in (
        "suburb", "neighbourhood", "quarter", "city_district",
        "residential", "commercial", "industrial",
    ):
        val = (addr.get(key) or "").strip().lower()
        if val == target:
            return True
    name = (hit.get("name") or "").strip().lower()
    if name == target:
        return True
    # Fallback: display_name begins with "Sector N," — and the number is exactly
    # n, so "Sector 3" does not accept a "Sector 18" match.
    return bool(re.match(rf"sector\s+{n}\b", hit.get("display_name", ""), re.I))


def geocode_sector(
    client: httpx.Client, n: int, city: str, box: tuple[float, float, float, float]
) -> Optional[tuple[float, float, str]]:
    """(lat, lon, display_name) for "Sector N, city", or None if not an area here.

    Bounded to the city box so "Sector 50" cannot resolve to another city's
    sector, filtered to area records (a place/boundary settlement or a landuse
    polygon, never a shop or bus stop carrying the name), and required to name
    this exact sector so a fuzzy match to a different sector or the city centroid
    is rejected.
    """
    hits = _get_with_backoff(
        client,
        {
            "q": f"Sector {n}, {city}, India",
            "format": "json",
            "limit": 10,
            "addressdetails": 1,
            "viewbox": ",".join(str(v) for v in box),
            "bounded": 1,
        },
    )
    place = next(
        (h for h in hits if _is_sector_area(h) and _names_exact_sector(h, n)), None
    )
    if place is None:
        return None
    lat, lon = float(place["lat"]), float(place["lon"])
    if not _in_box(lat, lon, box):
        return None
    return lat, lon, place.get("display_name", "")


def _get_with_backoff(client: httpx.Client, params: dict[str, Any]) -> list[dict]:
    """One Nominatim search, retrying a 429 with exponential backoff."""
    wait = RATE_LIMIT_BACKOFF
    for attempt in range(RATE_LIMIT_RETRIES + 1):
        response = client.get(
            "https://nominatim.openstreetmap.org/search", params=params
        )
        if response.status_code == 429 and attempt < RATE_LIMIT_RETRIES:
            time.sleep(wait)
            wait *= 2
            continue
        response.raise_for_status()
        return response.json()
    return []


def collect(
    city: str, max_sector: int
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Geocode Sector 1..max_sector, keeping the unambiguous, non-duplicate ones.

    Returns (kept rows, counts of why others were skipped)."""
    box = _box_for(city)
    existing = existing_localities()
    existing_slugs = {e[0] for e in existing}
    # Proximity is checked against every seeded locality, not only this city's:
    # an H3 cell is shared across cities, and a sector sitting on top of, say, an
    # already-seeded village would overwrite its envelopes.
    existing_points = [(e[3], e[4]) for e in existing]
    existing_cells = {cell_for(la, lo) for la, lo in existing_points}

    kept: list[dict[str, Any]] = []
    kept_cells: set[str] = set()
    rejected = {"no area record": 0, "already seeded": 0, "too close": 0, "cell taken": 0}

    with httpx.Client(headers={"User-Agent": UA}, timeout=30) as client:
        for n in range(1, max_sector + 1):
            slug = slug_for(f"Sector {n}", city)
            if slug in existing_slugs:
                rejected["already seeded"] += 1
                continue

            time.sleep(SECONDS_BETWEEN_REQUESTS)
            try:
                hit = geocode_sector(client, n, city, box)
            except Exception as exc:  # network / rate limit — report and move on
                print(f"  Sector {n}: lookup failed ({exc})", file=sys.stderr)
                continue
            if hit is None:
                rejected["no area record"] += 1
                continue
            lat, lon, label = hit

            near = min(
                (haversine_km(lat, lon, la, lo) for la, lo in existing_points),
                default=999.0,
            )
            if near <= SAME_PLACE_KM:
                rejected["too close"] += 1
                continue

            cell = cell_for(lat, lon)
            if cell in existing_cells or cell in kept_cells:
                rejected["cell taken"] += 1
                continue

            kept_cells.add(cell)
            kept.append(
                {"slug": slug, "name": f"Sector {n}", "lat": lat, "lon": lon,
                 "label": label}
            )
            print(f"  Sector {n:>3}  {lat:.4f}, {lon:.4f}  {label[:60]}")

    return kept, rejected


def as_seed_rows(city: str, state: str, rows: list[dict[str, Any]]) -> str:
    """The kept sectors as seed-file lines. Pincode is None — Nominatim does not
    reliably carry one for a sector, and an empty value that looks like a held
    pincode is exactly what the seed-file contract forbids."""
    return "\n".join(
        f'    ("{r["slug"]}", "{r["name"]}", "{city}", "{state}", None, '
        f'{r["lat"]:.4f}, {r["lon"]:.4f}),'
        for r in rows
    )


def write_rows(city: str, state: str, rows: list[dict[str, Any]]) -> None:
    seed = pathlib.Path("agents/common/seed_localities.py")
    source = seed.read_text(encoding="utf-8")
    try:
        close_idx = source.index("\n]\n", source.index("LOCALITIES:"))
    except ValueError:
        print("\nCould not find the end of LOCALITIES; not writing.", file=sys.stderr)
        raise SystemExit(1)
    block = (
        f"\n    # --- Geocoded sectors, {city} "
        f"(scripts/geocode_sectors) ---\n{as_seed_rows(city, state, rows)}"
    )
    seed.write_text(source[:close_idx] + block + source[close_idx:], encoding="utf-8")


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Geocode a city's numbered sectors.")
    parser.add_argument("--city", required=True, choices=sorted(CITY_BOX))
    parser.add_argument(
        "--max", type=int, default=DEFAULT_MAX_SECTOR,
        help=f"Highest sector number to try (default {DEFAULT_MAX_SECTOR}).",
    )
    parser.add_argument(
        "--write", action="store_true",
        help="Append the kept rows to agents/common/seed_localities.py.",
    )
    args = parser.parse_args(argv)

    state = CITIES.get(args.city, {}).get("state")
    if not state:
        print(
            f"No state known for {args.city!r} in propose_localities.CITIES.",
            file=sys.stderr,
        )
        return 1

    print(f"Geocoding Sector 1..{args.max} for {args.city} "
          f"(Nominatim, bounded to the city box)\n")
    kept, rejected = collect(args.city, args.max)

    print(f"\nkept: {len(kept)}")
    print("skipped:")
    for reason, count in rejected.items():
        if count:
            print(f"  {count:4d}  {reason}")

    if args.write:
        if not kept:
            print("\nNothing to write.", file=sys.stderr)
            return 1
        write_rows(args.city, state, kept)
        print(f"\nAppended {len(kept)} rows to agents/common/seed_localities.py. "
              f"Review the diff before seeding.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
