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
        # Both spellings matter. Our own source clients use httpx; the Anthropic
        # SDK v1.x is built on httpx2 and logs through a logger of that name, so
        # silencing "httpx" alone left one INFO line per classification — 1,012
        # of them in a real run, burying the summary this command exists to
        # print.
        for noisy in ("httpx", "httpx2"):
            logging.getLogger(noisy).setLevel(logging.WARNING)

    print(
        "Sources: OpenStreetMap (school presence) + UDISE via India Data Portal\n"
        "         (staffing). Neither requires an API key.\n"
    )

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

    if outcome.schools_loaded or outcome.osm_loaded:
        print(
            f"Loaded: {outcome.schools_loaded} UDISE schools, "
            f"{outcome.osm_loaded} OSM schools\n"
        )

    for result in outcome.results:
        if result.ok and result.envelope is not None:
            p = result.envelope.payload
            ptr = p["median_pupil_teacher_ratio"]
            print(
                f"  OK   {result.slug:<18} "
                f"{p['schools_within_2km']:>3} within 2km  "
                f"{p['schools_within_5km']:>4} within 5km  "
                f"[{(p['presence_source'] or '?')[:14]:<14}]  "
                f"staffing for {p['schools_with_staffing_data']:>3}  "
                f"PTR {ptr if ptr is not None else '-':>5}  "
                f"{result.envelope.confidence.value}"
            )
        else:
            print(f"  SKIP {result.slug:<18} {result.reason}")

    if args.dry_run:
        print("\nDry run — all writes rolled back.")

    # Exit code semantics, which matter because CI reads them: a run where some
    # localities had no usable data is a *success*. Upstream feeds go down
    # routinely — that is why the skip logic exists — and failing on a partial
    # skip turns an ordinary Tuesday into a red build, and worse, stops the
    # workflow steps that come after it.
    #
    # Non-zero is reserved for "this run achieved nothing": every locality
    # skipped, which means a broken credential, a dead upstream, or a bug.
    stored = outcome.ok
    if stored == 0 and outcome.results:
        print(
            f"\nAll {outcome.skipped} localities skipped — nothing stored.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
