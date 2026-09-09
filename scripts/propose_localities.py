"""Propose new localities from OpenStreetMap, with the evidence for each.

    python -m scripts.propose_localities --city Bengaluru
    python -m scripts.propose_localities --city Gurugram --kinds suburb --limit 40
    python -m scripts.propose_localities --city Bengaluru --write

Coverage stopped at 44 because of how localities were added, not because of how
many exist. Every coordinate past the first eleven was hand-entered from
knowledge, then independently geocoded, and kept only where the two agreed. That
caught real errors — "DLF Phase 5" resolved to a commercial tower 7 km away —
and it does not scale past a few dozen.

**Why this is not a shortcut around that check.** OpenStreetMap records
neighbourhoods as tagged place nodes in their own right, and we already download
the whole region for the schools and connectivity agents. Reading the place node
does not ask a geocoder where a name is; the coordinate *is* the record.

That was validated against the 44 built the expensive way: 34 agree within a
kilometre, most to within ten metres, 2 within 2.5 km, 7 have no place node at
all, and exactly 1 disagrees — Manesar, where OSM's node is tagged `place=city`
and sits on the town centre while ours sits on the industrial belt. So the rule
here is narrow: take the node when its kind is one we asked for, and skip when
it is missing or tagged as something larger. Both failure modes are visible
rather than silent.

**A candidate must earn its place.** A locality that renders an empty report is
worse than one that does not exist: it invites a search, answers nothing, and
spends the reader's trust. So each candidate is scored on the data it would
actually produce — schools and amenities already in the extract — and anything
below the threshold is reported as rejected, with the count, rather than
quietly dropped.

Nothing here writes to the database. `--write` appends to
agents/common/seed_localities.py for review in a diff; seeding remains a
deliberate act.
"""

from __future__ import annotations

import argparse
import logging
import math
import pathlib
import re
import sys
from collections import Counter
from typing import Any, Iterable, Optional

import osmium
from dotenv import load_dotenv

load_dotenv(pathlib.Path(__file__).resolve().parents[1] / ".env")

from agents.common import osm_features  # noqa: E402

log = logging.getLogger(__name__)

# What OSM calls a neighbourhood, largest first. `city` and `town` are
# deliberately absent: Manesar is the worked example of why, and a node tagged
# `city` describes a settlement centre rather than a neighbourhood a buyer means.
PLACE_KINDS = ("suburb", "quarter", "neighbourhood")

# The settlement kinds used to decide which city a neighbourhood belongs to.
#
# Villages are deliberately excluded. Gurugram district contains dozens of them
# — Samaspur, Bajghera, Kankrola, Dhankot — and with villages counted, a sector
# a kilometre from one was attributed to the village rather than to Gurugram.
# That rejected 90 real Gurugram neighbourhoods in testing. Cities and towns are
# the level at which "which city is this in" has a useful answer.
SETTLEMENT_KINDS = ("city", "town")

# A neighbourhood belongs to whichever settlement node is nearest, and is only
# proposed when that settlement is the one being asked for.
#
# A radius around a city centre is not a city. Gurugram's centre is 20 km from
# south-west Delhi, so the first version of this proposed Saket, Hauz Khas,
# Malviya Nagar and Dwarka as localities of "Gurugram, Haryana" — and ranked
# them top, because Delhi is mapped more densely than Gurugram. Wrong city and
# wrong state on a page whose whole claim is accuracy.
#
# Nearest-settlement is a Voronoi assignment rather than a real boundary, so it
# will misplace a neighbourhood sitting almost exactly between two towns. That
# is a far smaller and far rarer error than the one it replaces, and it fails
# toward "not proposed" rather than toward "confidently mislabelled".
MAX_SETTLEMENT_KM = 25.0

CITIES: dict[str, dict[str, Any]] = {
    "Bengaluru": {
        "state": "Karnataka",
        "extract": "southern-zone",
        "centre": (12.9716, 77.5946),
        "radius_km": 25.0,
        # OSM carries both spellings, and older data still uses the pre-2014
        # one. Electronic City is tagged place=town and is administratively its
        # own municipal council, but it is already in the seed list as a
        # Bengaluru locality and nobody searching it means anywhere else —
        # without it here, 18 neighbouring layouts were refused as "belongs to
        # Electronic City, not Bengaluru".
        "aliases": ["Bangalore", "Electronic City"],
    },
    "Gurugram": {
        "state": "Haryana",
        "extract": "northern-zone",
        "centre": (28.4595, 77.0266),
        "radius_km": 20.0,
        # Manesar is tagged place=city in OSM and is a municipal town in its own
        # right, but a buyer searching it means Gurugram — it is already in the
        # seed list as a Gurugram locality, so its neighbourhoods belong here.
        "aliases": ["Gurgaon", "Manesar"],
    },
}

# Two candidates closer than this with the same name are the same place mapped
# twice. Beyond it they are genuinely different — Bengaluru has more than one
# "Ashok Nagar" — and an ambiguous name is dropped rather than guessed at.
SAME_PLACE_KM = 1.5

# A candidate this close to a locality we already have is that locality under
# another name, not a new one.
ALREADY_COVERED_KM = 1.2

# What a candidate must have within 2 km to be worth a page. Deliberately low:
# the product reports its own coverage per locality and the search card now says
# "2 of 5 categories", so a thin locality is honest rather than broken. What it
# rules out is a page with nothing on it at all.
MIN_SCHOOLS = 3
MIN_AMENITIES = 8
YIELD_RADIUS_KM = 2.0

# Names that are not neighbourhoods even when tagged as one.
NAME_NOISE = re.compile(
    r"\b(market|bus stand|bus stop|railway station|metro|circle|junction|"
    r"flyover|depot|police station|post office|hospital|temple|church|mosque)\b",
    re.I,
)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def slugify(name: str) -> str:
    text = name.lower().replace("&", "and")
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def existing_localities() -> list[tuple[str, str, str, float, float]]:
    """(slug, name, city, lat, lon) already in the seed file.

    Read from the source rather than the database so this works before the
    database is reachable, and so the check is against what will be seeded
    rather than what happens to be loaded.
    """
    source = pathlib.Path("agents/common/seed_localities.py").read_text(encoding="utf-8")
    row = re.compile(
        r'\(\s*"([a-z0-9-]+)",\s*"([^"]+)",\s*"(\w+)",[^)]*?'
        r'(-?\d+\.\d+),\s*(-?\d+\.\d+)\s*\)'
    )
    return [
        (m.group(1), m.group(2), m.group(3), float(m.group(4)), float(m.group(5)))
        for m in row.finditer(source)
    ]


def nearest_settlement(
    lat: float, lon: float, settlements: list[dict[str, Any]]
) -> Optional[dict[str, Any]]:
    """Which town or city a point most plausibly belongs to."""
    best, best_km = None, MAX_SETTLEMENT_KM
    for s in settlements:
        d = haversine_km(lat, lon, s["lat"], s["lon"])
        if d < best_km:
            best, best_km = s, d
    return best


def read_places(path: pathlib.Path, kinds: Iterable[str]) -> list[dict[str, Any]]:
    """Named place nodes from an extract.

    Nodes only, and therefore one cheap pass: a place node carries its own
    coordinate, so none of the way and relation resolution the feature reader
    needs applies here.
    """
    wanted = set(kinds)
    out: list[dict[str, Any]] = []
    for obj in osmium.FileProcessor(str(path)).with_filter(
        osmium.filter.KeyFilter("place")
    ):
        if not obj.is_node():
            continue
        tags = dict(obj.tags)
        kind = tags.get("place")
        name = (tags.get("name") or "").strip()
        if kind not in wanted or not name:
            continue
        out.append({
            "name": name,
            "kind": kind,
            "lat": obj.location.lat,
            "lon": obj.location.lon,
            "pincode": (tags.get("addr:postcode") or "").strip() or None,
            "wikidata": tags.get("wikidata"),
        })
    return out


def _yield_for(
    candidate: dict[str, Any], features: list[Any]
) -> tuple[int, int]:
    """(schools, other amenities) within YIELD_RADIUS_KM."""
    schools = amenities = 0
    pad = YIELD_RADIUS_KM / 111.0
    pad_lon = pad / max(math.cos(math.radians(candidate["lat"])), 0.01)
    for f in features:
        if abs(f.lat - candidate["lat"]) > pad or abs(f.lon - candidate["lon"]) > pad_lon:
            continue
        if haversine_km(candidate["lat"], candidate["lon"], f.lat, f.lon) > YIELD_RADIUS_KM:
            continue
        if f.tags.get("amenity") == "school":
            schools += 1
        else:
            amenities += 1
    return schools, amenities


def propose(city: str, kinds: list[str], *, cache_dir: pathlib.Path) -> dict[str, Any]:
    config = CITIES[city]
    clat, clon = config["centre"]
    city_aliases = {a.lower() for a in [city, *config.get("aliases", [])]}

    features = osm_features.features_for(config["extract"], cache_dir=cache_dir)
    pbf = osm_features.download_extract(config["extract"], cache_dir=cache_dir)
    places = read_places(pbf, list(kinds) + list(SETTLEMENT_KINDS))

    settlements = [p for p in places if p["kind"] in SETTLEMENT_KINDS]
    candidates = [p for p in places if p["kind"] in set(kinds)]
    if not settlements:
        raise SystemExit("No settlement nodes found; cannot tell which city a "
                         "neighbourhood belongs to.")

    rejected: Counter[str] = Counter()
    in_range = []
    for place in candidates:
        if haversine_km(clat, clon, place["lat"], place["lon"]) > config["radius_km"]:
            continue
        if NAME_NOISE.search(place["name"]):
            rejected["name is a landmark, not a neighbourhood"] += 1
            continue
        # The radius is a cheap prefilter; this is the actual test. Without it
        # the proposal contained south-west Delhi, ranked above Gurugram.
        home = nearest_settlement(place["lat"], place["lon"], settlements)
        if home is None:
            rejected["no settlement near enough to attribute it to"] += 1
            continue
        if home["name"].lower() not in city_aliases:
            rejected[f"belongs to {home['name']}, not {city}"] += 1
            continue
        in_range.append(place)

    # An ambiguous name cannot be resolved to one place, and a page titled with
    # it would be wrong for whoever meant the other one.
    by_name: dict[str, list[dict[str, Any]]] = {}
    for place in in_range:
        by_name.setdefault(place["name"].lower(), []).append(place)

    unambiguous = []
    for name, group in by_name.items():
        if len(group) == 1:
            unambiguous.append(group[0])
            continue
        far_apart = any(
            haversine_km(a["lat"], a["lon"], b["lat"], b["lon"]) > SAME_PLACE_KM
            for i, a in enumerate(group) for b in group[i + 1:]
        )
        if far_apart:
            rejected[f"name appears in {len(group)} distinct places"] += 1
        else:
            unambiguous.append(group[0])  # same place mapped more than once

    existing = [e for e in existing_localities() if e[2] == city]
    fresh = []
    for place in unambiguous:
        nearest = min(
            (haversine_km(place["lat"], place["lon"], e[3], e[4]) for e in existing),
            default=999.0,
        )
        if nearest <= ALREADY_COVERED_KM:
            rejected["already covered by an existing locality"] += 1
            continue
        fresh.append(place)

    accepted, thin = [], []
    seen_slugs = {e[0] for e in existing_localities()}
    for place in fresh:
        schools, amenities = _yield_for(place, features)
        place["schools"] = schools
        place["amenities"] = amenities
        if schools < MIN_SCHOOLS or amenities < MIN_AMENITIES:
            thin.append(place)
            continue
        slug = slugify(place["name"])
        if slug in seen_slugs:
            rejected["slug collides with an existing locality"] += 1
            continue
        seen_slugs.add(slug)
        place["slug"] = slug
        accepted.append(place)

    accepted.sort(key=lambda p: (p["schools"] + p["amenities"]), reverse=True)
    rejected["too little mapped nearby to fill a page"] = len(thin)
    return {
        "city": city,
        "state": config["state"],
        "considered": len(places),
        "in_range": len(in_range),
        "accepted": accepted,
        "thin": thin,
        "rejected": rejected,
    }


def as_seed_rows(result: dict[str, Any], limit: Optional[int]) -> str:
    rows = result["accepted"][:limit] if limit else result["accepted"]
    lines = []
    for p in rows:
        # None, not "". OpenStreetMap carries addr:postcode on almost no place
        # node — seven of eleven hundred in Bengaluru — and an empty string sits
        # in the column looking like a pincode we hold and simply cannot render.
        # The column and the API model are both optional; absent is the honest
        # value, and tests/test_seed_localities pins the difference.
        pincode = f'"{p["pincode"]}"' if p["pincode"] else "None"
        lines.append(
            f'    ("{p["slug"]}", "{p["name"]}", "{result["city"]}", '
            f'"{result["state"]}", {pincode}, {p["lat"]:.4f}, {p["lon"]:.4f}),'
        )
    return "\n".join(lines)


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Propose new localities from OpenStreetMap place nodes."
    )
    parser.add_argument("--city", choices=sorted(CITIES), required=True)
    parser.add_argument(
        "--kinds", default=",".join(PLACE_KINDS),
        help=f"OSM place kinds to accept (default: {','.join(PLACE_KINDS)}).",
    )
    parser.add_argument("--limit", type=int, help="Keep only the top N by mapped data.")
    parser.add_argument(
        "--write", action="store_true",
        help="Append the accepted rows to agents/common/seed_localities.py "
             "for review in a diff. Does not touch the database.",
    )
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)-7s %(message)s",
    )
    for noisy in ("httpx", "httpx2"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    kinds = [k.strip() for k in args.kinds.split(",") if k.strip()]
    result = propose(args.city, kinds, cache_dir=osm_features.DEFAULT_CACHE)

    # Deliberately not called "inside the search radius": this count is taken
    # after the city attribution too, so saying "in range" alone would credit
    # the radius with filtering that the attribution actually did.
    print(f"\n{args.city}: {result['considered']} place nodes of kind "
          f"{'/'.join(kinds)} in the extract, {result['in_range']} of them in "
          f"range and attributed to {args.city}\n")

    print(f"{'locality':30s} {'kind':14s} {'schools':>7s} {'amenities':>9s}")
    shown = result["accepted"][:args.limit] if args.limit else result["accepted"]
    for p in shown:
        print(f"{p['name'][:30]:30s} {p['kind']:14s} {p['schools']:7d} {p['amenities']:9d}")

    print(f"\naccepted: {len(result['accepted'])}"
          + (f" (showing {len(shown)})" if len(shown) != len(result["accepted"]) else ""))
    print("rejected:")
    for reason, count in result["rejected"].most_common():
        if count:
            print(f"  {count:5d}  {reason}")

    if args.write:
        if not shown:
            print("\nNothing to write.", file=sys.stderr)
            return 1
        seed = pathlib.Path("agents/common/seed_localities.py")
        source = seed.read_text(encoding="utf-8")
        marker = "]\n\n\ndef main() -> None:"
        if marker not in source:
            print("\nCould not find the end of LOCALITIES; not writing.", file=sys.stderr)
            return 1
        block = (
            f"\n    # --- Proposed from OpenStreetMap place nodes, "
            f"{args.city} ---\n"
            f"{as_seed_rows(result, args.limit)}\n"
        )
        seed.write_text(source.replace(marker, block + marker), encoding="utf-8")
        print(f"\nAppended {len(shown)} rows to {seed}. Review the diff before seeding.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
