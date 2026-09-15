"""What visitors asked us to cover, most-requested first.

    python -m scripts.locality_requests                # last 90 days
    python -m scripts.locality_requests --days 30
    python -m scripts.locality_requests --csv > requests.csv

Grouped on the normalised text, with where the place lookup put it and how far
it is from the nearest locality we already have. Read the output as a shortlist
for scripts/propose_localities.py, not as an instruction: twenty requests for
"Pune" is a request for a city, not a locality, and a place 600 m from a covered
locality is usually already answered by that locality's report.
"""

from __future__ import annotations

import argparse
import csv
import pathlib
import sys

from dotenv import load_dotenv

load_dotenv(pathlib.Path(__file__).resolve().parents[1] / ".env")

from agents.common import db  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--days", type=int, default=90)
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--csv", action="store_true", help="Write CSV to stdout.")
    args = parser.parse_args(argv)

    with db.connect() as conn:
        rows = conn.execute(
            """
            SELECT query_key,
                   COUNT(*)                                   AS times,
                   MODE() WITHIN GROUP (ORDER BY query_text)  AS example,
                   MODE() WITHIN GROUP (ORDER BY city)        AS city,
                   MODE() WITHIN GROUP (ORDER BY place_label) AS place,
                   AVG(lat) AS lat, AVG(lon) AS lon,
                   MODE() WITHIN GROUP (ORDER BY nearest_slug) AS nearest,
                   MIN(nearest_km)                            AS nearest_km,
                   MAX(created_at)                            AS last_asked
              FROM locality_request
             WHERE created_at >= now() - make_interval(days => %s)
             GROUP BY query_key
             ORDER BY times DESC, last_asked DESC
             LIMIT %s
            """,
            (args.days, args.limit),
        ).fetchall()

    if args.csv:
        writer = csv.writer(sys.stdout)
        writer.writerow(["times", "asked_as", "city", "place", "lat", "lon", "nearest", "nearest_km", "last_asked"])
        for r in rows:
            writer.writerow([r["times"], r["example"], r["city"], r["place"],
                             r["lat"], r["lon"], r["nearest"], r["nearest_km"], r["last_asked"]])
        return 0

    if not rows:
        print(f"No requests in the last {args.days} days.")
        return 0

    print(f"Most-requested places, last {args.days} days\n")
    for r in rows:
        where = r["place"] or "not found on the map"
        near = (
            f"{r['nearest_km']:.1f} km from {r['nearest']}"
            if r["nearest"] and r["nearest_km"] is not None
            else "no covered locality nearby"
        )
        print(f"{r['times']:>4}  {r['example']:<28} {near:<34} {where[:60]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
