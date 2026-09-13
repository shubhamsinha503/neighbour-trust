"""One complete news-monitoring pass, shared by the CLI and the scheduler."""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from typing import Optional

from agents.common import db
from agents.news_monitor import agent as news_agent
from agents.news_monitor import classify as classify_mod
from agents.news_monitor.sources import gdelt as gdelt_src
from agents.news_monitor.sources import google_news as gnews_src

log = logging.getLogger(__name__)


@dataclass
class JobOutcome:
    mentions_found: int = 0
    judged: int = 0
    confirmed: int = 0
    undecided: int = 0
    deferred: int = 0
    classifier: str = "none"
    ok: int = 0
    skipped: int = 0
    results: list[news_agent.LocalityResult] = field(default_factory=list)


def run_once(
    *,
    skip_fetch: bool = False,
    prefer_claude: bool = True,
    dry_run: bool = False,
    record_run: bool = True,
    locality_slug: Optional[str] = None,
) -> JobOutcome:
    """Fetch, classify, then rebuild the crime and water envelopes.

    `skip_fetch` re-runs classification and aggregation over mentions already
    stored — the useful mode after adding an API key, since it works through the
    existing backlog without spending ten minutes back on GDELT's rate limit.
    """
    outcome = JobOutcome()
    classifier = classify_mod.build_classifier(prefer_claude=prefer_claude)
    outcome.classifier = classifier.name
    gnews_client = gnews_src.GoogleNewsClient()

    # GDELT is opt-in, and off by default as of 2026-09-01 because it has been
    # unreachable from every network tried — this machine and GitHub's runners
    # both time out, including on the TLS handshake.
    #
    # This is not merely tidiness. Each failed attempt burns the full 30-second
    # connect timeout before Google News is even tried, and a run makes 22 of
    # them: eleven minutes of a thirty-minute job spent waiting on a dead host.
    # Set ENABLE_GDELT=1 to try it again once it recovers.
    gdelt_client = (
        gdelt_src.GdeltClient()
        if os.environ.get("ENABLE_GDELT", "").strip().lower() in ("1", "true", "yes")
        else None
    )
    if gdelt_client is None:
        log.info("GDELT disabled (set ENABLE_GDELT=1 to re-enable)")

    started = time.monotonic()
    try:
        with db.connect() as conn:
            # Logged against 'crime' because ingest_run keys on a real category
            # and news is a shared source rather than a category of its own.
            run_id = (
                db.start_ingest_run(
                    conn,
                    category="crime",
                    sources={
                        gnews_src.SOURCE_NAME: True,
                        gdelt_src.SOURCE_NAME: True,
                        classifier.name: True,
                    },
                )
                if record_run and not dry_run
                else None
            )
            if run_id is not None:
                conn.commit()

            try:
                localities = (
                    [db.get_locality(conn, locality_slug)]
                    if locality_slug
                    else db.list_localities(conn)
                )
                localities = [item for item in localities if item]
                if not localities:
                    raise RuntimeError(
                        "No localities seeded. Run: python -m agents.common.seed_localities"
                    )

                if not skip_fetch:
                    # Longest-unfetched first, within a time limit. Re-reading
                    # all 159 localities took 70 of the run's 70 minutes on
                    # 2026-09-13 and left classification its five-minute floor —
                    # 78 headlines judged, against a backlog of thousands. A
                    # locality's news changes over weeks, so rotating through
                    # the list across a few daily runs loses nothing, and the
                    # time goes to judging what is already stored.
                    fetch_order = (
                        localities
                        if locality_slug
                        else db.localities_by_news_staleness(conn)
                    )
                    fetch_minutes = float(
                        os.environ.get("NEWS_FETCH_BUDGET_MINUTES")
                        or news_agent.DEFAULT_FETCH_BUDGET_MINUTES
                    )
                    fetched_localities = 0
                    for locality in fetch_order:
                        if time.monotonic() - started > fetch_minutes * 60:
                            log.info(
                                "fetch budget reached after %d of %d localities; "
                                "the rest are first in line next run",
                                fetched_localities, len(fetch_order),
                            )
                            break
                        outcome.mentions_found += news_agent.fetch_for_locality(
                            conn,
                            locality,
                            gnews_client=gnews_client,
                            gdelt_client=gdelt_client,
                        )
                        fetched_localities += 1
                        # Per locality, so a run killed mid-fetch keeps what it
                        # read and the rotation order reflects it.
                        if not dry_run:
                            conn.commit()
                    if not dry_run:
                        # Commit the fetch before classifying: GDELT's rate limit
                        # makes a re-fetch expensive, and a classifier failure
                        # should not throw the articles away.
                        conn.commit()

                # Commits as it goes and stops at its budget, so the envelopes
                # below are built from this run's judgements even when the
                # backlog is larger than one run can clear. A dry run commits
                # nothing, mid-pass or otherwise.
                #
                # The budget is what is left of the whole run's allowance, not a
                # fixed slice: a slow fetch across 159 localities leaves less
                # time to classify, and the envelopes still have to be built
                # inside the workflow's 90-minute limit.
                run_minutes = float(
                    os.environ.get("NEWS_RUN_BUDGET_MINUTES")
                    or news_agent.DEFAULT_RUN_BUDGET_MINUTES
                )
                elapsed = time.monotonic() - started
                budget_seconds = max(
                    news_agent.MIN_CLASSIFY_SECONDS, run_minutes * 60 - elapsed
                )
                classified = news_agent.classify_pending(
                    conn,
                    classifier,
                    budget_seconds=budget_seconds,
                    commit=not dry_run,
                )
                outcome.judged = classified.judged
                outcome.confirmed = classified.confirmed
                outcome.undecided = classified.undecided
                outcome.deferred = classified.deferred
                if not dry_run:
                    conn.commit()

                for locality in localities:
                    for category in news_agent.CATEGORIES:
                        result = news_agent.build_envelope(
                            conn, locality, category=category
                        )
                        outcome.results.append(result)
                        if result.ok:
                            outcome.ok += 1
                        else:
                            outcome.skipped += 1

                if dry_run:
                    conn.rollback()
                else:
                    conn.commit()

                if run_id is not None:
                    db.finish_ingest_run(
                        conn, run_id, status="ok", ok=outcome.ok, skipped=outcome.skipped
                    )
                    conn.commit()

            except Exception as exc:
                conn.rollback()
                if run_id is not None:
                    db.finish_ingest_run(
                        conn,
                        run_id,
                        status="error",
                        ok=outcome.ok,
                        skipped=outcome.skipped,
                        error=f"{type(exc).__name__}: {exc}"[:2000],
                    )
                    conn.commit()
                raise
    finally:
        gnews_client.close()
        if gdelt_client is not None:
            gdelt_client.close()

    return outcome
