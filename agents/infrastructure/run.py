"""CLI for the connectivity agent.

    python -m agents.infrastructure.run                 # every locality
    python -m agents.infrastructure.run --locality hsr-layout
    python -m agents.infrastructure.run --extracts northern-zone

Reads OpenStreetMap from local Geofabrik extracts rather than querying the
Overpass API. The API version of this job never finished: forty-four radius
queries against donated infrastructure covered 3 of 44 localities at best, and
its worst failure was an overloaded mirror returning an HTML error page with a
200 status, which parsed into "this locality has no hospitals".

The extracts are a few hundred megabytes and cached for a day. Reading both
takes roughly eight minutes, after which every locality is answered from memory
with no further network access — so the run is deterministic and repeatable,
which the API version could never be.

**The database is checked first, on purpose.** Reading the extracts is the
expensive step, and it is pointless if there is nowhere to write the result.
Building the client first cost a full eight-minute read before failing on a
database that had been unreachable the whole time.
"""

from __future__ import annotations

import argparse
import logging
import pathlib
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from dotenv import load_dotenv

load_dotenv(pathlib.Path(__file__).resolve().parents[2] / ".env")

from agents.common import db  # noqa: E402
from agents.infrastructure import agent as infra_agent  # noqa: E402
from agents.infrastructure.sources import osm_extract as osm  # noqa: E402

# A locality whose connectivity was written inside this window is skipped.
#
# Less load-bearing than it was against Overpass, where it was the only way a
# timed-out run could ever reach the tail of the list. It stays because what is
# built near a locality changes on the order of years, so rewriting an identical
# envelope every run buys nothing. --force overrides it.
FRESH_FOR = timedelta(days=6)


def _select(conn, args) -> tuple[Optional[list[dict[str, Any]]], int]:
    """Which localities still need fetching, and how many were already current.

    Done before the extracts are read so the run can stop early — either because
    the database is unreachable, or because there is simply nothing to do.
    """
    localities = (
        [db.get_locality(conn, args.locality)]
        if args.locality
        else db.list_localities(conn)
    )
    if localities == [None]:
        return None, 0

    if args.force:
        return list(localities), 0

    pending, fresh = [], 0
    cutoff = datetime.now(timezone.utc) - FRESH_FOR
    for locality in localities:
        existing = db.latest_envelope_by_source(
            conn,
            category="infrastructure",
            h3_cell=locality["h3_cell"],
            source_name=osm.SOURCE_NAME,
        )
        if existing and existing["fetched_at"] > cutoff:
            fresh += 1
        else:
            pending.append(locality)
    return pending, fresh


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Fetch what is built near each locality.")
    parser.add_argument("--locality", help="Run for a single locality slug.")
    parser.add_argument(
        "--extracts",
        help="Comma-separated extract names to read "
             f"(default: all of {', '.join(osm.EXTRACTS)}).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-fetch localities that already have recent connectivity data.",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verbose", "-v", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)-7s %(message)s",
    )
    if not args.verbose:
        for noisy in ("httpx", "httpx2"):
            logging.getLogger(noisy).setLevel(logging.WARNING)

    print("Source: OpenStreetMap, from local Geofabrik extracts (no API key needed)")
    print("Shows what is already built nearby - not RERA or upcoming projects.\n")

    # Phase 1 — cheap, and it decides whether the expensive phase is worth doing.
    try:
        with db.connect() as conn:
            pending, fresh = _select(conn, args)
    except Exception as exc:
        print(f"Database unreachable: {exc}", file=sys.stderr)
        return 1

    if pending is None:
        print(f"Unknown locality: {args.locality}", file=sys.stderr)
        return 1
    if not pending:
        print(f"All {fresh} localities are already current. Use --force to re-fetch.")
        return 0

    print(f"{len(pending)} localities to fetch"
          + (f", {fresh} already current" if fresh else ""))

    # Phase 2 — the slow part. Nothing here touches the database.
    names = (
        [n.strip() for n in args.extracts.split(",") if n.strip()]
        if args.extracts
        else None
    )
    try:
        client = osm.OsmExtractClient(names)
    except Exception as exc:
        print(f"Could not read OpenStreetMap extracts: {exc}", file=sys.stderr)
        return 1

    vintage = client.data_vintage
    print(f"OpenStreetMap snapshot: {vintage:%Y-%m-%d %H:%M UTC}\n" if vintage
          else "OpenStreetMap snapshot: unknown\n")

    # Phase 3 — write. A fresh connection, because the read above can take the
    # better part of ten minutes and a connection held open across it would be
    # closed by anything with an idle timeout.
    ok = skipped = 0
    try:
        with db.connect() as conn:
            run_id = db.start_ingest_run(
                conn, category="infrastructure", sources={osm.SOURCE_NAME: True}
            )
            conn.commit()

            for locality in pending:
                result = infra_agent.build_envelope(conn, locality, client=client)
                if result.ok:
                    ok += 1
                    conn.commit()
                    print(f"  OK   {result.slug:20s} score {result.score:3d}  "
                          f"{result.envelope.payload['summary'][:60]}")
                else:
                    skipped += 1
                    print(f"  --   {result.slug:20s} {result.reason[:70]}")

            if args.dry_run:
                conn.rollback()
                print("\nDry run - all writes rolled back.")
            else:
                db.finish_ingest_run(
                    conn, run_id, status="ok", ok=ok, skipped=skipped
                )
                conn.commit()
    finally:
        client.close()

    print(f"\n{ok} stored, {skipped} unmapped, {fresh} already current.")
    # Non-zero only when nothing was stored *and* nothing was already fresh. A
    # run that skipped everything because the data is current is a success.
    return 0 if (ok or fresh) else 1


if __name__ == "__main__":
    sys.exit(main())
