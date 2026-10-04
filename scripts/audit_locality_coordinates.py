"""Flag localities whose stored coordinates fall outside their own city.

Why this exists. Air quality, schools and connectivity do not match on a
locality's name — they search by its stored latitude/longitude (nearest station,
schools within a radius, amenities around a point). That makes them immune to the
same-name collision that affects the news categories, but only as far as the
coordinates are right. If a locality was geocoded into the wrong city at seeding
time — Hyderabad's "Anna Nagar" placed at Chennai's coordinates — then *every*
coordinate-based category silently describes the wrong place, and no agent-level
fix can catch it because each agent is faithfully reading the point it was given.

So this is the companion check to the news-pipeline fix: the news fix stops a
name from pulling in another city's coverage; this stops a point from sitting in
another city to begin with. It reads only; it changes nothing.

    python -m scripts.audit_locality_coordinates
    python -m scripts.audit_locality_coordinates --json   # machine-readable

Exit status is 1 when any locality is outside its city's box, so this can gate a
seeding change in CI. A city with no box defined here is reported as "unchecked"
rather than failing — the fix for that is to add its bounds below, not to guess.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

from dotenv import load_dotenv

load_dotenv(pathlib.Path(__file__).resolve().parents[1] / ".env")

from agents.common import db  # noqa: E402

# Generous metropolitan bounding boxes: (min_lon, min_lat, max_lon, max_lat).
#
# Deliberately loose. The job here is to catch a locality sitting in the wrong
# *city* — hundreds of kilometres out — not to second-guess a centroid by a few
# streets. A box tight enough to argue over a kilometre would cry wolf on honest
# edge-of-town localities, and a boy-who-cried-wolf audit gets ignored. Keys are
# matched case-insensitively against the locality's `city`.
CITY_BOXES: dict[str, tuple[float, float, float, float]] = {
    "bengaluru": (77.30, 12.70, 77.90, 13.25),
    "bangalore": (77.30, 12.70, 77.90, 13.25),
    "hyderabad": (78.15, 17.15, 78.80, 17.70),
    "secunderabad": (78.15, 17.15, 78.80, 17.70),
    "mumbai": (72.70, 18.85, 73.10, 19.35),
    "navi mumbai": (72.95, 18.95, 73.15, 19.15),
    "thane": (72.90, 19.10, 73.10, 19.30),
    "chennai": (80.05, 12.75, 80.40, 13.30),
    "delhi": (76.80, 28.38, 77.40, 28.90),
    "new delhi": (76.80, 28.38, 77.40, 28.90),
    "gurugram": (76.80, 28.28, 77.20, 28.58),
    "gurgaon": (76.80, 28.28, 77.20, 28.58),
    "noida": (77.28, 28.38, 77.60, 28.68),
    "pune": (73.65, 18.35, 74.05, 18.70),
    "kolkata": (88.20, 22.40, 88.50, 22.80),
    "ahmedabad": (72.40, 22.90, 72.80, 23.20),
}


def _box_for(city: str) -> tuple[float, float, float, float] | None:
    return CITY_BOXES.get((city or "").strip().lower())


def audit(localities: list[dict]) -> dict:
    """Sort every locality into inside / outside / unchecked / no-coords."""
    outside: list[dict] = []
    unchecked: dict[str, int] = {}
    missing_coords: list[dict] = []
    inside = 0

    for loc in localities:
        lat, lon = loc.get("lat"), loc.get("lon")
        if lat is None or lon is None:
            missing_coords.append({"slug": loc.get("slug"), "city": loc.get("city")})
            continue

        box = _box_for(loc.get("city") or "")
        if box is None:
            city = (loc.get("city") or "?").strip()
            unchecked[city] = unchecked.get(city, 0) + 1
            continue

        min_lon, min_lat, max_lon, max_lat = box
        if not (min_lat <= lat <= max_lat and min_lon <= lon <= max_lon):
            outside.append(
                {
                    "slug": loc.get("slug"),
                    "name": loc.get("name"),
                    "city": loc.get("city"),
                    "lat": round(float(lat), 4),
                    "lon": round(float(lon), 4),
                    "expected_box": box,
                }
            )
        else:
            inside += 1

    return {
        "total": len(localities),
        "inside": inside,
        "outside": outside,
        "missing_coords": missing_coords,
        "unchecked_cities": unchecked,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Flag localities whose coordinates are outside their city."
    )
    parser.add_argument("--json", action="store_true", help="Emit the report as JSON.")
    args = parser.parse_args(argv)

    with db.connect() as conn:
        localities = db.list_localities(conn)

    report = audit(localities)

    if args.json:
        print(json.dumps(report, indent=2))
        return 1 if report["outside"] else 0

    print(
        f"Checked {report['total']} localities: "
        f"{report['inside']} inside their city box, "
        f"{len(report['outside'])} outside, "
        f"{len(report['missing_coords'])} without coordinates.\n"
    )

    if report["outside"]:
        print("OUTSIDE their city — likely geocoded to the wrong place:")
        for row in report["outside"]:
            print(
                f"  {row['city']:<12} {row['slug']:<22} "
                f"at {row['lat']}, {row['lon']}  (expected within {row['expected_box']})"
            )
        print()

    if report["missing_coords"]:
        print("No coordinates stored (cannot be placed at all):")
        for row in report["missing_coords"]:
            print(f"  {row['city']:<12} {row['slug']}")
        print()

    if report["unchecked_cities"]:
        print(
            "Unchecked — no bounding box defined for these cities "
            "(add them to CITY_BOXES to include them):"
        )
        for city, n in sorted(report["unchecked_cities"].items()):
            print(f"  {city:<16} {n} localit{'y' if n == 1 else 'ies'}")
        print()

    if report["outside"]:
        print("FAIL: some localities are outside their city.")
        return 1
    print("OK: every placed locality falls within its city's box.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
