"""Scheduled ingestion. Run as its own long-lived process.

    python -m agents.scheduler

Per docs/build-roadmap.md this is APScheduler to start, moving to a managed
queue if fetch volume grows. At one agent and eleven localities that point is a
long way off.

Why this matters more than it looks: OpenAQ serves a **90-day** history window,
data.gov.in and AQICN serve none at all. Every hour this process isn't running is
an hour of trend data that becomes unrecoverable once it falls out of that
window. `aq_observation` accumulating our own readings is the one asset here that
compounds — and it only compounds while this is running.

Air quality and schools are scheduled today. As the remaining Phase 2 agents land
they register here on their own cadences (weekly for RERA, continuous for news),
which is why the job registry is a table rather than a single hardcoded call.
"""

from __future__ import annotations

import logging
import os
import random
import signal
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from dotenv import load_dotenv

load_dotenv()

from apscheduler.schedulers.blocking import BlockingScheduler  # noqa: E402
from apscheduler.triggers.cron import CronTrigger  # noqa: E402

from agents.air_quality import job as air_quality_job  # noqa: E402
from agents.schools import job as schools_job  # noqa: E402

log = logging.getLogger("scheduler")

IST = timezone(timedelta(hours=5, minutes=30))


def run_air_quality() -> None:
    """One hourly air quality pass."""
    started = datetime.now(timezone.utc)
    log.info("air_quality: starting")
    try:
        outcome = air_quality_job.run_once()
    except air_quality_job.NoSourcesConfigured as exc:
        # Loud, and keep the scheduler alive: a missing key is an operator
        # problem to fix, not a reason to take ingestion down for every future
        # hour as well.
        log.error("air_quality: %s", exc)
        return
    except Exception:
        log.exception("air_quality: run failed")
        return

    elapsed = (datetime.now(timezone.utc) - started).total_seconds()
    log.info(
        "air_quality: done in %.0fs — %d stored, %d skipped",
        elapsed, outcome.ok, outcome.skipped,
    )
    for result in outcome.results:
        if not result.ok:
            log.warning("  skipped %s: %s", result.slug, result.reason)


def run_schools() -> None:
    """One weekly schools pass.

    Weekly rather than the annual cadence docs/strategy.md gives UDISE, because
    the two sources behind this agent move at completely different speeds: the
    UDISE snapshot is frozen at 2022 and will not change until the portal
    publishes a new cycle, but OpenStreetMap is edited continuously and is what
    supplies the school counts. Annual would leave the presence data stale for
    months at a time; weekly is cheap (two Overpass queries and one CKAN page
    walk) and keeps the number that buyers actually read current.
    """
    started = datetime.now(timezone.utc)
    log.info("schools: starting")
    try:
        outcome = schools_job.run_once()
    except Exception:
        log.exception("schools: run failed")
        return

    elapsed = (datetime.now(timezone.utc) - started).total_seconds()
    log.info(
        "schools: done in %.0fs — %d UDISE + %d OSM loaded, %d localities stored, %d skipped",
        elapsed, outcome.schools_loaded, outcome.osm_loaded, outcome.ok, outcome.skipped,
    )
    for result in outcome.results:
        if not result.ok:
            log.warning("  skipped %s: %s", result.slug, result.reason)


# (name, callable, cron kwargs). Cadences come from the agent specification in
# docs/strategy.md.
JOBS: list[tuple[str, Callable[[], None], dict[str, Any]]] = [
    # Hourly, but deliberately not on the hour: CPCB publishes near the hour and
    # every naive scraper in the country hits it at :00. A fixed offset also
    # makes our traffic pattern predictable to the upstream, which is politer
    # than jittering every run.
    ("air_quality", run_air_quality, {"minute": 17}),
    # Sunday 03:47 UTC — off-peak for Overpass, which is donated infrastructure.
    ("schools", run_schools, {"day_of_week": "sun", "hour": 3, "minute": 47}),
]


def main() -> int:
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)-7s %(name)s %(message)s",
    )
    # httpx logs a line per request at INFO; at ~80 requests a run that buries
    # everything else.
    logging.getLogger("httpx").setLevel(logging.WARNING)

    scheduler = BlockingScheduler(timezone="UTC")

    for name, func, cron in JOBS:
        scheduler.add_job(
            func,
            trigger=CronTrigger(**cron, timezone="UTC"),
            id=name,
            name=name,
            max_instances=1,      # a slow run must never overlap the next one
            coalesce=True,        # after downtime, catch up once rather than N times
            misfire_grace_time=1800,
        )
        log.info("registered %s with cron %s", name, cron)

    # Run once at boot unless told not to. A fresh deploy should not wait up to an
    # hour before it has any data, and after a restart the gap wants filling
    # immediately.
    if os.environ.get("RUN_ON_STARTUP", "true").lower() in ("1", "true", "yes"):
        log.info("running all jobs once at startup")
        for name, func, _cron in JOBS:
            func()

    for sig in (signal.SIGINT, signal.SIGTERM):
        signal.signal(sig, lambda *_: scheduler.shutdown(wait=False))

    log.info("scheduler up with %d job(s) registered", len(JOBS))
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        log.info("scheduler stopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
