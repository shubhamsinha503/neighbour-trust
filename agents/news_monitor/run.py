"""CLI for the news-monitoring agent.

    python -m agents.news_monitor.run                    # fetch + classify + build
    python -m agents.news_monitor.run --skip-fetch       # classify the backlog only
    python -m agents.news_monitor.run --locality indiranagar
    python -m agents.news_monitor.run --no-claude        # force the heuristic
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

from agents.news_monitor import job as news_job  # noqa: E402


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Fetch and classify locality news.")
    parser.add_argument("--locality", help="Run for a single locality slug.")
    parser.add_argument(
        "--skip-fetch",
        action="store_true",
        help="Classify and aggregate what is already stored.",
    )
    parser.add_argument(
        "--no-claude",
        action="store_true",
        help="Use the heuristic classifier even if a key is available.",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)-7s %(message)s",
    )
    if not args.verbose:
        logging.getLogger("httpx").setLevel(logging.WARNING)

    has_key = bool(os.environ.get("ANTHROPIC_API_KEY"))
    using_claude = has_key and not args.no_claude
    print("Sources: Google News RSS + GDELT DOC 2.0 (neither needs an API key)")
    print(
        f"Classifier: {'Claude' if using_claude else 'heuristic'}"
        f"{'' if has_key else '  (ANTHROPIC_API_KEY not set)'}\n"
    )

    try:
        outcome = news_job.run_once(
            skip_fetch=args.skip_fetch,
            prefer_claude=not args.no_claude,
            dry_run=args.dry_run,
            locality_slug=args.locality,
        )
    except Exception as exc:
        print(f"Run failed: {exc}", file=sys.stderr)
        return 1

    print(
        f"Mentions fetched : {outcome.mentions_found}\n"
        f"Judged           : {outcome.judged} "
        f"({outcome.confirmed} confirmed as incidents)\n"
        f"Left undecided   : {outcome.undecided}  <- excluded from all counts\n"
        f"Classifier       : {outcome.classifier}\n"
    )

    for result in outcome.results:
        if result.ok and result.envelope is not None:
            news = result.envelope.payload.get("news") or {}
            print(
                f"  OK   {result.slug:<18} {result.category:<6} "
                f"{news.get('incidents_12m', 0):>3} incidents / "
                f"{news.get('mentions_fetched', 0):>3} mentions  "
                f"{result.envelope.confidence.value}"
            )
        else:
            print(f"  SKIP {result.slug:<18} {result.category:<6} {result.reason}")

    if args.dry_run:
        print("\nDry run — all writes rolled back.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
