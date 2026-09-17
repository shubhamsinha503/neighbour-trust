"""The front-page visit counter.

A running tally of homepage views, shown as "N and counting". See
infra/migrations/011_visit_counter.sql for why it holds nothing but the number.

Two endpoints:

  GET  /api/v1/visits   read the tally — a browser may call this directly, like
                        every other read, so the page can render the number
                        server-side with no flash.
  POST /api/v1/visits   add one and return the new total. Reached through the
                        web server rather than the browser, like the question
                        box and locality requests: the API accepts only GETs
                        from browsers, and the in-memory rate limit needs the
                        forwarded address a server hop passes along.

The count is page views, not people — a reload counts again. That is the honest
name for what a single UPDATE-on-load measures, and the front page is free to
label it however it likes.
"""

from __future__ import annotations

import os
import time
from typing import Optional

from fastapi import APIRouter, HTTPException, Request

from agents.common import db

router = APIRouter()

# A vanity counter is inherently gameable, so these are an abuse ceiling, not an
# accuracy control: they stop one reloading tab or a trivial script from
# ballooning the number, and undercounting a genuine burst of real visitors by a
# few is a price worth paying for that. Both are generous for real traffic.
PER_CLIENT_PER_MINUTE = int(os.environ.get("VISITS_PER_CLIENT_PER_MINUTE", "20"))
# Keyed on the forwarded address, which a caller reaching the API directly can
# spoof for a fresh bucket — so a global cap, counting every accepted increment,
# is what actually bounds how fast the tally can be inflated.
GLOBAL_PER_MINUTE = int(os.environ.get("VISITS_GLOBAL_PER_MINUTE", "600"))
_hits: dict[str, list[float]] = {}
_recent: list[float] = []


def allowed(client_key: str, now: Optional[float] = None) -> bool:
    current = time.time() if now is None else now
    _recent[:] = [t for t in _recent if current - t < 60]
    if len(_recent) >= GLOBAL_PER_MINUTE:
        return False
    recent = [t for t in _hits.get(client_key, []) if current - t < 60]
    if len(recent) >= PER_CLIENT_PER_MINUTE:
        _hits[client_key] = recent
        return False
    recent.append(current)
    _hits[client_key] = recent
    _recent.append(current)
    return True


def _read_total(conn) -> int:
    row = conn.execute("SELECT total FROM visit_counter WHERE id = 1").fetchone()
    # The migration seeds the row, but a fresh database mid-migration might not
    # have it yet; a missing counter reads as zero rather than a 500.
    return int(row["total"]) if row else 0


@router.get("/api/v1/visits")
def get_visits() -> dict[str, int]:
    with db.connect() as conn:
        return {"total": _read_total(conn)}


@router.post("/api/v1/visits")
def add_visit(request: Request) -> dict[str, int]:
    forwarded = request.headers.get("x-forwarded-for", "")
    client = forwarded.split(",")[0].strip() or (
        request.client.host if request.client else "unknown"
    )
    # Over the cap: do not count this one, but still answer with the real total
    # so the badge shows the true number rather than an error.
    if not allowed(client):
        with db.connect() as conn:
            return {"total": _read_total(conn)}

    with db.connect() as conn:
        # One atomic statement: no read-modify-write window for a concurrent
        # view to slip through, and it returns the value it just wrote.
        row = conn.execute(
            "UPDATE visit_counter SET total = total + 1 WHERE id = 1 RETURNING total"
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=503, detail="Counter not ready.")
        return {"total": int(row["total"])}
