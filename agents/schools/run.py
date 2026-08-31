"""CLI entry point for the schools agent.

    python -m agents.schools.run                # load UDISE, rebuild envelopes
    python -m agents.schools.run --skip-ingest  # rebuild envelopes only
    python -m agents.schools.run --dry-run
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

from agents.schools import job as schools_job  # noqa: E402


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Fetch, normalize and store school data.")
    parser.add_argument(
        "--skip-ingest",
        action="store_true",
        help="Rebuild locality envelopes from schools already stored, without re-downloading.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Fetch but roll back all writes.")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)-7s %(message)s",
    )
    if not args.verbose:
        logging.getLogger("httpx").setLevel(logging.WARNING)

    print("Source: UDISE via India Data Portal (no API key required)\n")

    try:
        outcome = schools_job.run_once(skip_ingest=args.skip_ingest, dry_run=args.dry_run)
    except Exception as exc:
        print(f"Run failed: {exc}", file=sys.stderr)
        return 1

    if outcome.data_vintage is not None:
        age_years = (datetime.now(timezone.utc) - outcome.data_vintage).days / 365.25
        print(
            f"UDISE snapshot: {outcome.data_vintage.date()} "
            f"({age_years:.1f} years old)\n"
        )

    if outcome.schools_loaded:
        print(f"Schools loaded: {outcome.schools_loaded}\n")

    for result in outcome.results:
        if result.ok and result.envelope is not None:
            p = result.envelope.payload
            ptr = p["median_pupil_teacher_ratio"]
            print(
                f"  OK   {result.slug:<18} "
                f"{p['schools_within_2km']:>3} within 2km  "
                f"{p['schools_within_5km']:>4} within 5km  "
                f"PTR {ptr if ptr is not None else '  -':>5}  "
                f"score {p['median_proxy_score'] if p['median_proxy_score'] is not None else '-':>5}  "
                f"{result.envelope.confidence.value}"
            )
        else:
            print(f"  SKIP {result.slug:<18} {result.reason}")

    if args.dry_run:
        print("\nDry run — all writes rolled back.")

    return 1 if outcome.skipped else 0


if __name__ == "__main__":
    raise SystemExit(main())
