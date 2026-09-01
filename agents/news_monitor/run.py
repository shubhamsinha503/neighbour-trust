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

from agents.common import db
from agents.news_monitor import classify as classify_mod
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
    parser.add_argument(
        "--reclassify",
        action="store_true",
        help=(
            "Re-judge every already-classified mention. Needed after a classifier "
            "change: judged mentions are normally never revisited, so a prompt fix "
            "otherwise leaves the verdicts it was written to correct in place. "
            "Costs a full classification pass."
        ),
    )
    parser.add_argument(
        "--reclassify-from",
        metavar="PREFIX",
        help=(
            "Re-judge only mentions decided by classifiers matching this prefix, "
            "e.g. 'heuristic'. Cheaper than --reclassify when only part of the "
            "corpus needs revisiting."
        ),
    )
    parser.add_argument("--dry-run", action="store_true")
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

    has_key = bool(os.environ.get("ANTHROPIC_API_KEY"))
    using_claude = has_key and not args.no_claude
    print("Sources: Google News RSS + GDELT DOC 2.0 (neither needs an API key)")
    print(
        f"Classifier: {'Claude' if using_claude else 'heuristic'}"
        f"{'' if has_key else '  (ANTHROPIC_API_KEY not set)'}\n"
    )

    if args.reclassify or args.reclassify_from:
        # Prove the classifier can answer before queueing anything for it.
        #
        # The first version cleared first and classified afterwards. Run against
        # an account with no quota left, it cleared 3,031 verdicts and judged
        # none of them. Clearing no longer destroys the old verdict, so that is
        # survivable now — but queueing 3,000 re-judgements that will all fail is
        # still a wasted run, and the operator should be told why rather than
        # discovering it in a summary of zeroes.
        probe = classify_mod.build_classifier(prefer_claude=not args.no_claude)
        if probe.name.startswith("heuristic"):
            print(
                "Refusing to re-classify: no Claude classifier available "
                "(ANTHROPIC_API_KEY unset, or --no-claude given). The heuristic "
                "would replace considered verdicts with keyword matches.",
                file=sys.stderr,
            )
            return 1

        if probe.classify(
            title="Two held for chain snatching near the market",
            locality="Koramangala",
            city="Bengaluru",
            category="crime",
        ) is None:
            print(
                "Refusing to re-classify: the classifier could not answer a test "
                "headline. Usually an exhausted quota or an invalid key. Check the "
                "account before spending a run on it. Nothing was changed.",
                file=sys.stderr,
            )
            return 1

        prefix = args.reclassify_from
        with db.connect() as conn:
            cleared = db.clear_classifications(conn, classifier_prefix=prefix)
            conn.commit()
        scope = f"judged by {prefix}*" if prefix else "previously judged"
        print(f"Re-classifying: queued {cleared} mentions {scope}.")
        print("Existing verdicts stand until a new judgement replaces each one.")
        print("These are re-judged below at full classification cost.\n")

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
