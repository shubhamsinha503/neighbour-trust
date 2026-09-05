"""CLI for the connectivity agent.

    python -m agents.infrastructure.run                 # every locality
    python -m agents.infrastructure.run --locality hsr-layout

Overpass is donated infrastructure and slow at this query size — between twenty
seconds and four minutes per locality in testing. A full pass is therefore the
longest job in this repo, and the cadence is weekly for the same reason the
schools agent's is: what is built near a locality does not change hourly, and
hammering a volunteer-run service for data that moves annually would be rude as
well as pointless.
"""

from __future__ import annotations

import argparse
import logging
import pathlib
import sys
import time
from typing import Optional

from dotenv import load_dotenv

load_dotenv(pathlib.Path(__file__).resolve().parents[2] / ".env")

from agents.common import db  # noqa: E402
from agents.infrastructure import agent as infra_agent  # noqa: E402
from agents.infrastructure.sources import osm_amenities as osm  # noqa: E402

# Overpass asks for a pause between queries. Being a good citizen here is also
# self-interested: the 504s that made the first run take four minutes a locality
# were the service pushing back.
PAUSE_SECONDS = 3.0


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Fetch what is built near each locality.")
    parser.add_argument("--locality", help="Run for a single locality slug.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)-7s %(message)s",
    )
    if not args.verbose:
        for noisy in ("httpx", "httpx2"):
            logging.getLogger(noisy).setLevel(logging.WARNING)

    print("Source: OpenStreetMap via Overpass (no API key needed)")
    print("Shows what is already built nearby — not RERA or upcoming projects.\n")

    client = osm.OsmAmenityClient()
    ok = skipped = 0

    try:
        with db.connect() as conn:
            localities = (
                [db.get_locality(conn, args.locality)]
                if args.locality
                else db.list_localities(conn)
            )
            if localities == [None]:
                print(f"Unknown locality: {args.locality}", file=sys.stderr)
                return 1

            run_id = db.start_ingest_run(conn, category="infrastructure")
            conn.commit()

            for index, locality in enumerate(localities):
                if index:
                    time.sleep(PAUSE_SECONDS)
                result = infra_agent.build_envelope(conn, locality, client=client)
                if result.ok:
                    ok += 1
                    conn.commit()
                    print(f"  OK   {result.slug:20s} score {result.score:3d}  "
                          f"{result.envelope.payload['summary'][:60]}")
                else:
                    skipped += 1
                    print(f"  --   {result.slug:20s} {result.reason[:70]}")

            if args.dry_run:
                conn.rollback()
                print("\nDry run — all writes rolled back.")
            else:
                db.finish_ingest_run(
                    conn, run_id, status="ok",
                    localities_ok=ok, localities_skipped=skipped,
                    sources={osm.SOURCE_NAME: True},
                )
                conn.commit()
    finally:
        client.close()

    print(f"\n{ok} stored, {skipped} skipped.")
    # Non-zero only when nothing was stored. A partial pass is the normal shape
    # of a run against a service that rate-limits, and failing CI for it would
    # block every later step for no reason.
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
