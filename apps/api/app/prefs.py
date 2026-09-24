"""Preferences for a visitor who has consented but not signed in.

See infra/migrations/014_visitor_prefs.sql for what is stored and why, and the
privacy page for the promise this reverses. In one line: after a visitor says
yes to the consent banner, the web app mints an opaque `visitor_id`, keeps it in
an HttpOnly cookie, and this router reads and writes that visitor's preferences
against it.

**Who is allowed to call this.** The browser never talks here directly — the API
allows only GET from browser origins (see the CORS config in main.py), so a page
on another site cannot write on a visitor's behalf. The web app's own server
reads the cookie and calls these endpoints, passing the id in the `x-visitor-id`
header rather than the URL so it never lands in a server log or a Referer. That
is the same server-hop pattern as visits.py and accounts.py.

Three endpoints, all keyed on that header:

  GET    /api/v1/prefs   read this visitor's stored preferences (for the server
                         to paint the right city with no flash).
  PUT    /api/v1/prefs   upsert them.
  DELETE /api/v1/prefs   forget this visitor entirely — one row, gone. This is
                         the erasure right; clearing the cookie orphans the id,
                         and this removes the row it pointed at.

The id is opaque and consent-gated, so there is no per-person secret to verify
the way accounts.py verifies a signed session — the id *is* the capability. An
abuse ceiling, not an identity check, keeps a script from writing to millions of
random ids: the same in-memory limiter shape the rest of the API uses.
"""

from __future__ import annotations

import os
import time
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from agents.common import db

router = APIRouter()

# A preference write is cheap and idempotent, so this is purely an abuse ceiling
# — it stops a scripted caller inventing ids and filling the table, not a real
# visitor who saves a handful of times an hour. Global, because the per-id key is
# attacker-chosen and a fresh id sidesteps any per-id window.
GLOBAL_WRITES_PER_MINUTE = int(os.environ.get("PREFS_GLOBAL_PER_MINUTE", "600"))
_recent_writes: list[float] = []

MAX_CITY_CHARS = 120


def _write_allowed(now: Optional[float] = None) -> bool:
    current = time.time() if now is None else now
    _recent_writes[:] = [t for t in _recent_writes if current - t < 60]
    if len(_recent_writes) >= GLOBAL_WRITES_PER_MINUTE:
        return False
    _recent_writes.append(current)
    return True


def _require_visitor_id(raw: Optional[str]) -> str:
    """The visitor id from the header, validated as a real UUID.

    Rejecting anything that is not a UUID keeps a caller from using this column
    as an arbitrary key-value store, and means a malformed id fails fast rather
    than inserting a junk row.
    """
    if not raw:
        raise HTTPException(status_code=400, detail="Missing visitor id.")
    try:
        return str(uuid.UUID(raw))
    except (ValueError, AttributeError) as exc:
        raise HTTPException(status_code=400, detail="Malformed visitor id.") from exc


class PrefsBody(BaseModel):
    # None is a real value — it means "All cities", the absence of a filter — so
    # it is distinct from the field being omitted. The API treats both the same:
    # store NULL.
    city: Optional[str] = Field(None, max_length=MAX_CITY_CHARS)


class PrefsOut(BaseModel):
    city: Optional[str] = None


@router.get("/api/v1/prefs", response_model=PrefsOut)
def get_prefs(x_visitor_id: Optional[str] = Header(None)) -> dict[str, Any]:
    visitor_id = _require_visitor_id(x_visitor_id)
    with db.connect() as conn:
        row = conn.execute(
            "SELECT city FROM visitor_pref WHERE visitor_id = %s", (visitor_id,)
        ).fetchone()
    # No row yet is not an error: a visitor who consented a moment ago but has
    # not chosen anything simply has no stored city.
    return {"city": row["city"] if row else None}


@router.put("/api/v1/prefs", response_model=PrefsOut)
def put_prefs(
    body: PrefsBody, request: Request, x_visitor_id: Optional[str] = Header(None)
) -> dict[str, Any]:
    visitor_id = _require_visitor_id(x_visitor_id)
    if not _write_allowed():
        # Do not fail the visitor's action loudly over an abuse ceiling; report
        # what is stored so the client stays consistent.
        with db.connect() as conn:
            row = conn.execute(
                "SELECT city FROM visitor_pref WHERE visitor_id = %s", (visitor_id,)
            ).fetchone()
        return {"city": row["city"] if row else None}

    city = (body.city or "").strip() or None
    with db.connect() as conn:
        row = conn.execute(
            """
            INSERT INTO visitor_pref (visitor_id, city)
            VALUES (%s, %s)
            ON CONFLICT (visitor_id) DO UPDATE SET
                city       = EXCLUDED.city,
                updated_at = now()
            RETURNING city
            """,
            (visitor_id, city),
        ).fetchone()
    return {"city": row["city"] if row else None}


@router.delete("/api/v1/prefs")
def delete_prefs(x_visitor_id: Optional[str] = Header(None)) -> dict[str, bool]:
    """Erase this visitor's row. Deleting a row that never existed is a success.

    The erasure right: nothing is kept "in case". Once the web app also clears
    the cookie, the id this pointed at can never be presented again.
    """
    visitor_id = _require_visitor_id(x_visitor_id)
    with db.connect() as conn:
        conn.execute("DELETE FROM visitor_pref WHERE visitor_id = %s", (visitor_id,))
    return {"deleted": True}
