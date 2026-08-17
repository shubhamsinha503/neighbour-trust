"""CLI entry point for the air quality agent.

    python -m agents.air_quality.run              # every seeded locality
    python -m agents.air_quality.run --locality indiranagar
    python -m agents.air_quality.run --dry-run    # fetch and report, write nothing

The hourly schedule from docs/build-roadmap.md (APScheduler) wraps this; keeping
the entry point a plain CLI means the schedule is a deployment concern rather
than something baked into the agent.
"""

from __future__ import annotations

import argparse
import logging
import sys
from typing import Optional

from dotenv import load_dotenv

load_dotenv()  # before the config module reads anything

from agents.air_quality import agent as aq_agent  # noqa: E402
from agents.air_quality.sources import aqicn as aqicn_src  # noqa: E402
from agents.air_quality.sources import cpcb as cpcb_src  # noqa: E402
from agents.air_quality.sources import openaq as openaq_src  # noqa: E402
from agents.common import db  # noqa: E402
from agents.common.config import AQICN, DATA_GOV_IN, OPENAQ  # noqa: E402


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Fetch, normalize and store air quality data.")
    parser.add_argument("--locality", help="Run for a single locality slug.")
    parser.add_argument("--trend-days", type=int, default=30)
    parser.add_argument("--dry-run", action="store_true", help="Fetch but roll back all writes.")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)-7s %(message)s",
    )

    # Report the source situation up front. A run that silently used one fewer
    # source than expected is the kind of thing that gets noticed weeks later.
    print("Sources configured:")
    for name, configured in aq_agent.available_clients().items():
        print(f"  {'yes' if configured else 'NO '}  {name}")
    print()

    if not OPENAQ.is_set() and not DATA_GOV_IN.is_set():
        print(
            "No air quality source is configured — need DATA_GOV_IN_API_KEY or "
            "OPENAQ_API_KEY in .env. See .env.example.",
            file=sys.stderr,
        )
        return 2

    openaq_client = openaq_src.OpenAqClient() if OPENAQ.is_set() else None
    cpcb_client = cpcb_src.CpcbClient() if DATA_GOV_IN.is_set() else None
    aqicn_client = aqicn_src.AqicnClient() if AQICN.is_set() else None

    failures = 0
    try:
        with db.connect() as conn:
            localities = (
                [db.get_locality(conn, args.locality)]
                if args.locality
                else db.list_localities(conn)
            )
            if not localities or localities[0] is None:
                print(
                    "No localities found. Run: python -m agents.common.seed_localities",
                    file=sys.stderr,
                )
                return 2

            for locality in localities:
                result = aq_agent.run_for_locality(
                    conn,
                    locality,
                    openaq_client=openaq_client,
                    cpcb_client=cpcb_client,
                    aqicn_client=aqicn_client,
                    trend_days=args.trend_days,
                )
                if result.ok and result.envelope is not None:
                    payload = result.envelope.payload
                    print(
                        f"  OK   {result.slug:<18} AQI {payload['current_aqi']:>5} "
                        f"({payload['aqi_band']:<12}) "
                        f"{payload['nearest_station_km']:>5} km  "
                        f"{result.envelope.confidence.value:<10} "
                        f"trend {result.trend_days:>2}d  "
                        f"[{payload['station_name']}]"
                    )
                else:
                    failures += 1
                    print(f"  SKIP {result.slug:<18} {result.reason}")

            if args.dry_run:
                conn.rollback()
                print("\nDry run — all writes rolled back.")
            else:
                conn.commit()
    finally:
        for client in (openaq_client, cpcb_client, aqicn_client):
            if client is not None:
                client.close()

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
