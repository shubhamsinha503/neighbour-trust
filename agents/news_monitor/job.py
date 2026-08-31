"""One complete news-monitoring pass, shared by the CLI and the scheduler."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

from agents.common import db
from agents.news_monitor import agent as news_agent
from agents.news_monitor import classify as classify_mod
from agents.news_monitor.sources import gdelt as gdelt_src

log = logging.getLogger(__name__)


@dataclass
class JobOutcome:
    mentions_found: int = 0
    judged: int = 0
    confirmed: int = 0
    undecided: int = 0
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
    client = gdelt_src.GdeltClient()

    try:
        with db.connect() as conn:
            # Logged against 'crime' because ingest_run keys on a real category
            # and news is a shared source rather than a category of its own.
            run_id = (
                db.start_ingest_run(
                    conn,
                    category="crime",
                    sources={gdelt_src.SOURCE_NAME: True, classifier.name: True},
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
                    for locality in localities:
                        outcome.mentions_found += news_agent.fetch_for_locality(
                            conn, client, locality
                        )
                    if not dry_run:
                        # Commit the fetch before classifying: GDELT's rate limit
                        # makes a re-fetch expensive, and a classifier failure
                        # should not throw the articles away.
                        conn.commit()

                classified = news_agent.classify_pending(conn, classifier)
                outcome.judged = classified.judged
                outcome.confirmed = classified.confirmed
                outcome.undecided = classified.undecided
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
        client.close()

    return outcome
