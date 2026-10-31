"""One complete air quality ingestion pass over every seeded locality.

Shared by the CLI (agents/air_quality/run.py) and the scheduler
(agents/scheduler.py) so a manual run and a scheduled run do exactly the same
thing — including writing to ingest_run. A scheduled job that behaves differently
from the one you tested by hand is a job you cannot debug.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import timedelta
from typing import Optional

from agents.air_quality import agent as aq_agent
from agents.air_quality.sources import aqicn as aqicn_src
from agents.air_quality.sources import cpcb as cpcb_src
from agents.air_quality.sources import openaq as openaq_src
from agents.common import db
from agents.common.config import AQICN, DATA_GOV_IN, OPENAQ

log = logging.getLogger(__name__)

# How recently a locality must have been refreshed to be skipped this pass.
# Air quality is a 24-hour mean, so it does not move meaningfully hour to hour;
# refreshing each locality at most every few hours is plenty, and skipping the
# rest is what keeps a pass off the network-transfer allowance. Re-pulling
# 30-day trends for 1,600+ localities every hour is what exhausted it.
DEFAULT_FRESHNESS = timedelta(hours=6)

# Wall-clock budget for one pass. Comfortably under the CI step timeout so a pass
# always finishes cleanly and commits its progress, instead of running for hours
# and being cancelled with nothing stored. With incremental commits, the next
# pass picks up the localities this one did not reach.
DEFAULT_MAX_RUNTIME_SECONDS = 2400.0  # 40 minutes


@dataclass
class JobOutcome:
    ok: int = 0
    skipped: int = 0
    fresh: int = 0  # skipped because refreshed recently
    budget_hit: bool = False  # stopped early on the time budget
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
    freshness: Optional[timedelta] = DEFAULT_FRESHNESS,
    max_runtime_seconds: Optional[float] = DEFAULT_MAX_RUNTIME_SECONDS,
    force_refresh: bool = False,
) -> JobOutcome:
    """Fetch, normalize and store air quality for every locality (or just one).

    Raises NoSourcesConfigured only when there is genuinely no source at all —
    no station key AND the keyless CAMS model turned off. Deliberately loud
    rather than a quiet no-op, because a scheduler silently doing nothing for a
    week looks identical to a scheduler working fine on stale data.

    When no station key is set but CAMS is on, the run proceeds model-only: the
    station chain yields nothing and every locality falls through to a modelled,
    LOW-confidence PM2.5 estimate (basis=cams_model). That keeps every card
    populated with real, clearly-labelled data instead of a blank — without
    inventing a station reading.

    Three guards keep a pass bounded, so it never again runs for hours, gets
    cancelled, and stores nothing:
      - **freshness skip**: localities refreshed within `freshness` are skipped,
        so a pass only works the stale ones instead of all 1,600+ every run.
      - **time budget**: the pass stops cleanly after `max_runtime_seconds`.
      - **incremental commits**: each locality commits on its own, so a pass that
        is cut short (budget or cancellation) keeps what it already did, and the
        next pass continues from where it left off.
    A single-locality run (`locality_slug`) and `force_refresh` both ignore the
    freshness skip. Pass `freshness=None` or `max_runtime_seconds=None` to
    disable either guard.
    """
    if not OPENAQ.is_set() and not DATA_GOV_IN.is_set():
        if not aq_agent.CAMS_FALLBACK:
            raise NoSourcesConfigured(
                "No air quality source configured — set DATA_GOV_IN_API_KEY or "
                "OPENAQ_API_KEY, or enable the keyless CAMS fallback. See "
                ".env.example."
            )
        log.warning(
            "No station key set (DATA_GOV_IN_API_KEY / OPENAQ_API_KEY). Running "
            "CAMS model-only: every locality gets a modelled, LOW-confidence "
            "PM2.5 estimate labelled cams_model — no station readings this pass."
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

                # Which localities to skip because they were refreshed recently.
                # Single-locality and force_refresh runs ignore the skip. One
                # small query, committed on its own so the per-locality writes
                # below are each a top-level transaction (and so commit as they
                # go) rather than savepoints of one never-committed batch.
                fresh_cells: set[str] = set()
                skip_fresh = (
                    locality_slug is None
                    and not force_refresh
                    and freshness is not None
                    and not dry_run
                )
                if skip_fresh:
                    with conn.transaction():
                        fresh_cells = db.fresh_envelope_cells(
                            conn, category="air_quality", within=freshness
                        )

                started = time.monotonic()

                def process(locality: Optional[dict]) -> None:
                    if locality is None:
                        return
                    if locality.get("h3_cell") in fresh_cells:
                        outcome.fresh += 1
                        return
                    try:
                        # run_for_locality guards each source; a call outside
                        # those guards — a transient 429, a city with no station
                        # list — still raises. Each locality is its own
                        # transaction so that one failure rolls back only itself
                        # and, on a real run, everything done so far is already
                        # committed and kept.
                        with conn.transaction():
                            result = aq_agent.run_for_locality(
                                conn,
                                locality,
                                openaq_client=openaq_client,
                                cpcb_client=cpcb_client,
                                aqicn_client=aqicn_client,
                                trend_days=trend_days,
                            )
                    except Exception as exc:
                        slug = (locality or {}).get("slug", "?")
                        log.warning("air quality failed for %s: %s", slug, exc)
                        outcome.skipped += 1
                        return
                    outcome.results.append(result)
                    if result.ok:
                        outcome.ok += 1
                    else:
                        outcome.skipped += 1

                def process_all() -> None:
                    for locality in localities:
                        if (
                            max_runtime_seconds is not None
                            and time.monotonic() - started > max_runtime_seconds
                        ):
                            outcome.budget_hit = True
                            log.warning(
                                "air quality: time budget %.0fs reached — stopping "
                                "with %d stored, %d fresh-skipped; the rest run next "
                                "pass",
                                max_runtime_seconds,
                                outcome.ok,
                                outcome.fresh,
                            )
                            break
                        process(locality)

                # Real runs commit each locality as they go (process_all with no
                # enclosing transaction). A dry run wraps everything in one
                # force-rollback transaction so nothing is written.
                if dry_run:
                    with conn.transaction(force_rollback=True):
                        process_all()
                else:
                    process_all()

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
