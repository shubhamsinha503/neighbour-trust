"""One complete air quality ingestion pass over every seeded locality.

Shared by the CLI (agents/air_quality/run.py) and the scheduler
(agents/scheduler.py) so a manual run and a scheduled run do exactly the same
thing — including writing to ingest_run. A scheduled job that behaves differently
from the one you tested by hand is a job you cannot debug.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from agents.air_quality import agent as aq_agent
from agents.air_quality.sources import aqicn as aqicn_src
from agents.air_quality.sources import cpcb as cpcb_src
from agents.air_quality.sources import openaq as openaq_src
from agents.common import db
from agents.common.config import AQICN, DATA_GOV_IN, OPENAQ

log = logging.getLogger(__name__)


@dataclass
class JobOutcome:
    ok: int = 0
    skipped: int = 0
    results: list[aq_agent.LocalityResult] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.results is None:
            self.results = []


class NoSourcesConfigured(RuntimeError):
    pass


def run_once(
    *,
    locality_slug: Optional[str] = None,
    trend_days: int = 30,
    dry_run: bool = False,
    record_run: bool = True,
) -> JobOutcome:
    """Fetch, normalize and store air quality for every locality (or just one).

    Raises NoSourcesConfigured if no upstream key is available — deliberately
    loud rather than a quiet no-op, because a scheduler silently doing nothing
    for a week looks identical to a scheduler working fine on stale data.
    """
    if not OPENAQ.is_set() and not DATA_GOV_IN.is_set():
        raise NoSourcesConfigured(
            "No air quality source configured — set DATA_GOV_IN_API_KEY or "
            "OPENAQ_API_KEY. See .env.example."
        )

    sources = aq_agent.available_clients()
    openaq_client = openaq_src.OpenAqClient() if OPENAQ.is_set() else None
    cpcb_client = cpcb_src.CpcbClient() if DATA_GOV_IN.is_set() else None
    aqicn_client = aqicn_src.AqicnClient() if AQICN.is_set() else None

    outcome = JobOutcome()

    try:
        with db.connect() as conn:
            run_id = (
                db.start_ingest_run(conn, category="air_quality", sources=sources)
                if record_run and not dry_run
                else None
            )
            if run_id is not None:
                # Committed immediately so the row is visible while the run is in
                # flight — that's what makes a crashed run detectable as a row
                # that never got a finished_at.
                conn.commit()

            try:
                localities = (
                    [db.get_locality(conn, locality_slug)]
                    if locality_slug
                    else db.list_localities(conn)
                )
                if not localities or localities[0] is None:
                    raise RuntimeError(
                        "No localities seeded. Run: python -m agents.common.seed_localities"
                    )

                for locality in localities:
                    result = aq_agent.run_for_locality(
                        conn,
                        locality,
                        openaq_client=openaq_client,
                        cpcb_client=cpcb_client,
                        aqicn_client=aqicn_client,
                        trend_days=trend_days,
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
        for client in (openaq_client, cpcb_client, aqicn_client):
            if client is not None:
                client.close()

    return outcome
