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

Five endpoints, all keyed on that header:

  GET    /api/v1/prefs   read this visitor's stored preferences (for the server
                         to paint the right city with no flash).
  PUT    /api/v1/prefs   upsert them.
  DELETE /api/v1/prefs   forget this visitor entirely — one row, gone. This is
                         the erasure right; clearing the cookie orphans the id,
                         and this removes the row it pointed at — and, by
                         cascade, the view history below.
  POST   /api/v1/prefs/views   record that this visitor opened a locality.
  GET    /api/v1/prefs/views   their recently viewed localities, newest first.

The id is opaque and consent-gated, so there is no per-person secret to verify
the way accounts.py verifies a signed session — the id *is* the capability. An
abuse ceiling, not an identity check, keeps a script from writing to millions of
random ids: the same in-memory limiter shape the rest of the API uses.
"""

from __future__ import annotations

import os
import re
import time
import uuid
from datetime import datetime
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


# ---- View history (infra/migrations/015_visitor_view.sql) ----
#
# Which locality reports a consented visitor opened. Written by the web app's
# server when a report page is shown, and only when the visitor accepted the
# banner wording that names history — the web app checks that before calling,
# and a visitor id exists only after consent at all.

SLUG_RE = re.compile(r"^[a-z0-9-]{1,80}$")

# A reload, or flicking back to a report a minute later, is the same visit and
# not worth a second row.
VIEW_DEDUPE_MINUTES = 30
# The history is a recent trail, not a lifetime record: both limits are applied
# to this visitor's rows on every write.
VIEW_RETENTION_DAYS = 180
MAX_VIEWS_PER_VISITOR = 500
MAX_VIEWS_RETURNED = 50


class ViewBody(BaseModel):
    slug: str = Field(..., max_length=80)


class ViewOut(BaseModel):
    slug: str
    name: str
    city: str
    viewed_at: datetime


def _require_slug(raw: str) -> str:
    slug = raw.strip().lower()
    if not SLUG_RE.match(slug):
        raise HTTPException(status_code=404, detail="Unknown locality.")
    return slug


@router.post("/api/v1/prefs/views")
def record_view(body: ViewBody, x_visitor_id: Optional[str] = Header(None)) -> dict[str, bool]:
    """Record that this visitor opened a locality's report.

    Never an error the visitor would notice: the web app fires this and ignores
    the answer. `recorded` says whether a row was actually written.
    """
    visitor_id = _require_visitor_id(x_visitor_id)
    slug = _require_slug(body.slug)
    if not _write_allowed():
        return {"recorded": False}

    with db.connect() as conn:
        locality = conn.execute(
            "SELECT id FROM locality WHERE slug = %s", (slug,)
        ).fetchone()
        if not locality:
            raise HTTPException(status_code=404, detail="Unknown locality.")

        # The history hangs off the preference row so "forget me" cascades to
        # it. A visitor who consented but never chose a city has no row yet.
        conn.execute(
            "INSERT INTO visitor_pref (visitor_id) VALUES (%s) ON CONFLICT DO NOTHING",
            (visitor_id,),
        )

        recent = conn.execute(
            """
            SELECT 1 FROM visitor_view
            WHERE visitor_id = %s AND locality_id = %s
              AND viewed_at > now() - make_interval(mins => %s)
            LIMIT 1
            """,
            (visitor_id, locality["id"], VIEW_DEDUPE_MINUTES),
        ).fetchone()
        if recent:
            return {"recorded": False}

        conn.execute(
            "INSERT INTO visitor_view (visitor_id, locality_id) VALUES (%s, %s)",
            (visitor_id, locality["id"]),
        )
        conn.execute(
            """
            DELETE FROM visitor_view
            WHERE visitor_id = %s
              AND (viewed_at < now() - make_interval(days => %s)
                   OR id NOT IN (
                       SELECT id FROM visitor_view
                       WHERE visitor_id = %s
                       ORDER BY viewed_at DESC, id DESC
                       LIMIT %s))
            """,
            (visitor_id, VIEW_RETENTION_DAYS, visitor_id, MAX_VIEWS_PER_VISITOR),
        )
    return {"recorded": True}


@router.get("/api/v1/prefs/views", response_model=list[ViewOut])
def list_views(
    limit: int = 10, x_visitor_id: Optional[str] = Header(None)
) -> list[dict[str, Any]]:
    """This visitor's recently viewed localities, newest first, one per locality."""
    visitor_id = _require_visitor_id(x_visitor_id)
    limit = max(1, min(limit, MAX_VIEWS_RETURNED))
    with db.connect() as conn:
        rows = conn.execute(
            """
            SELECT slug, name, city, viewed_at FROM (
                SELECT DISTINCT ON (l.id) l.slug, l.name, l.city, v.viewed_at
                FROM visitor_view v
                JOIN locality l ON l.id = v.locality_id
                WHERE v.visitor_id = %s
                ORDER BY l.id, v.viewed_at DESC
            ) latest
            ORDER BY viewed_at DESC
            LIMIT %s
            """,
            (visitor_id, limit),
        ).fetchall()
    return [dict(r) for r in rows]
