"""One complete schools ingestion pass, shared by the CLI and the scheduler.

Same contract as agents/air_quality/job.py — a manual run and a scheduled run
must do exactly the same thing, including writing to ingest_run.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from agents.common import db
from agents.schools import agent as schools_agent
from agents.schools.sources import osm as osm_src
from agents.schools.sources import udise as udise_src

log = logging.getLogger(__name__)


@dataclass
class JobOutcome:
    schools_loaded: int = 0
    osm_loaded: int = 0
    ok: int = 0
    skipped: int = 0
    data_vintage: Optional[datetime] = None
    results: list[schools_agent.LocalityResult] = field(default_factory=list)


def run_once(
    *,
    skip_ingest: bool = False,
    dry_run: bool = False,
    record_run: bool = True,
) -> JobOutcome:
    """Load UDISE schools, then rebuild every locality's schools envelope.

    `skip_ingest` rebuilds envelopes from schools already stored — useful after
    changing the scoring or the radii, which is the common case once the snapshot
    is loaded. There is no point re-downloading a 2022 snapshot to change a
    weighting.
    """
    outcome = JobOutcome()
    client = udise_src.UdiseClient()
    osm_client = osm_src.OsmSchoolsClient()

    try:
        with db.connect() as conn:
            run_id = (
                db.start_ingest_run(
                    conn, category="schools", sources={udise_src.SOURCE_NAME: True}
                )
                if record_run and not dry_run
                else None
            )
            if run_id is not None:
                conn.commit()

            try:
                vintage = client.data_vintage()
                outcome.data_vintage = vintage

                if not skip_ingest:
                    for city in udise_src.CITY_DISTRICTS:
                        result = schools_agent.ingest_city(conn, client, city=city)
                        outcome.schools_loaded += result.schools_loaded

                    # OSM second, and non-fatally: Overpass is donated
                    # infrastructure and goes busy under load. Losing it degrades
                    # presence counts back to UDISE, which is worse but not broken
                    # — losing the whole run over it would be.
                    for city in osm_src.CITY_BBOX:
                        try:
                            osm_result = schools_agent.ingest_city_osm(
                                conn, osm_client, city=city
                            )
                            outcome.osm_loaded += osm_result.schools_loaded
                        except Exception as exc:
                            log.warning("OSM ingest failed for %s: %s", city, exc)
                    # Commit the school load before building envelopes so a
                    # failure in aggregation doesn't discard a long download.
                    if not dry_run:
                        conn.commit()

                localities = db.list_localities(conn)
                if not localities:
                    raise RuntimeError(
                        "No localities seeded. Run: python -m agents.common.seed_localities"
                    )

                for locality in localities:
                    result = schools_agent.build_envelope_for_locality(
                        conn, locality, vintage=vintage
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
        osm_client.close()

    return outcome
