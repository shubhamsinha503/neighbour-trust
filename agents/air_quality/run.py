"""CLI entry point for the air quality agent.

    python -m agents.air_quality.run              # every seeded locality
    python -m agents.air_quality.run --locality indiranagar
    python -m agents.air_quality.run --dry-run    # fetch and report, write nothing

This is a thin wrapper over agents/air_quality/job.py, which is the same code the
scheduler runs — a manual run and a scheduled run must not diverge.
"""

from __future__ import annotations

import argparse
import logging
import sys
from typing import Optional

from dotenv import load_dotenv

load_dotenv()  # before the config module reads anything

from agents.air_quality import agent as aq_agent  # noqa: E402
from agents.air_quality import job as aq_job  # noqa: E402


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
    if not args.verbose:
        # Both spellings matter. Our own source clients use httpx; the Anthropic
        # SDK v1.x is built on httpx2 and logs through a logger of that name, so
        # silencing "httpx" alone left one INFO line per classification — 1,012
        # of them in a real run, burying the summary this command exists to
        # print.
        for noisy in ("httpx", "httpx2"):
            logging.getLogger(noisy).setLevel(logging.WARNING)

    # Report the source situation up front. A run that silently used one fewer
    # source than expected is the kind of thing that gets noticed weeks later.
    print("Sources configured:")
    for name, configured in aq_agent.available_clients().items():
        print(f"  {'yes' if configured else 'NO '}  {name}")
    print()

    try:
        outcome = aq_job.run_once(
            locality_slug=args.locality,
            trend_days=args.trend_days,
            dry_run=args.dry_run,
        )
    except aq_job.NoSourcesConfigured as exc:
        print(exc, file=sys.stderr)
        return 2
    except Exception as exc:
        print(f"Run failed: {exc}", file=sys.stderr)
        return 1

    for result in outcome.results:
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
            print(f"  SKIP {result.slug:<18} {result.reason}")

    if args.dry_run:
        print("\nDry run — all writes rolled back.")

    # Exit code semantics, which matter because CI reads them: a run where some
    # localities had no usable data is a success. Upstream feeds go down
    # routinely, which is why the skip logic exists, and failing on a partial
    # skip turns an ordinary Tuesday into a red build.
    #
    # All-skipped used to be a failure — the assumption being it was rare and
    # meant a broken credential, a dead upstream, or a bug. That assumption no
    # longer holds: India's regulatory air network (CPCB) has been silent since
    # 2026-08-27, and the OpenAQ/AQICN fallbacks frequently have no *live* station
    # within range of any locality, so all-skipped is now the routine state.
    # Failing the hourly build on it is noise the cards already state in words
    # ("no regulatory station reporting"). So warn loudly and still exit 0. A
    # genuinely broken credential surfaces as fetch errors in the log above, and
    # a total misconfiguration still exits non-zero via NoSourcesConfigured.
    stored = len(outcome.results) - outcome.skipped
    if stored == 0 and outcome.results:
        print(
            f"\nAll {outcome.skipped} localities skipped — nothing stored. No live "
            f"air-quality station within range of any locality; upstream feeds are "
            f"dry. Not treated as a build failure.",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
