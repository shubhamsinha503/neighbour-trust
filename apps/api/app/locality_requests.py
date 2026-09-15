"""Visitors asking us to cover a place we do not have yet.

Anonymous by design — see infra/migrations/010_locality_request.sql. The only
per-person state is an in-memory rate limit keyed by the forwarded address,
which is never written anywhere and resets when the server restarts.

Like the question box, this is reached through the web app's server rather
than straight from browsers, so the API keeps accepting only GETs from them.
"""

from __future__ import annotations

import os
import re
import time
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from agents.common import db

router = APIRouter()

# A person asking for their neighbourhood asks once or twice. Ten an hour is
# generous for that and useless for filling the table with junk.
PER_CLIENT_PER_HOUR = int(os.environ.get("LOCALITY_REQUESTS_PER_HOUR", "10"))
_hits: dict[str, list[float]] = {}


def query_key(text: str) -> str:
    """Lowercase, punctuation and repeated spaces removed — for counting repeats."""
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", text.lower())).strip()


def allowed(client_key: str, now: Optional[float] = None) -> bool:
    current = time.time() if now is None else now
    recent = [t for t in _hits.get(client_key, []) if current - t < 3600]
    if len(recent) >= PER_CLIENT_PER_HOUR:
        _hits[client_key] = recent
        return False
    recent.append(current)
    _hits[client_key] = recent
    return True


class LocalityRequestIn(BaseModel):
    query: str = Field(..., min_length=2, max_length=120)
    city: Optional[str] = Field(None, max_length=40)
    place_label: Optional[str] = Field(None, max_length=200)
    lat: Optional[float] = Field(None, ge=-90, le=90)
    lon: Optional[float] = Field(None, ge=-180, le=180)
    nearest_slug: Optional[str] = Field(None, max_length=80)
    nearest_km: Optional[float] = Field(None, ge=0, le=5000)


@router.post("/api/v1/locality-requests")
def create_locality_request(body: LocalityRequestIn, request: Request) -> dict[str, Any]:
    text = re.sub(r"\s+", " ", body.query).strip()
    key = query_key(text)
    if len(key) < 2:
        raise HTTPException(status_code=400, detail="Tell us the name of the place.")
    # A link is not a place name, and is the commonest form of junk submission.
    if re.search(r"https?://|www\.", text, re.I):
        raise HTTPException(status_code=400, detail="Just the name of the place, please.")

    forwarded = request.headers.get("x-forwarded-for", "")
    client = forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")
    if not allowed(client):
        raise HTTPException(status_code=429, detail="Thanks — we've got your requests. Please try again later.")

    with db.connect() as conn:
        conn.execute(
            """
            INSERT INTO locality_request
                (query_text, query_key, city, place_label, lat, lon, nearest_slug, nearest_km)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                text, key, body.city, body.place_label,
                body.lat, body.lon, body.nearest_slug, body.nearest_km,
            ),
        )
        asked = conn.execute(
            "SELECT COUNT(*) AS n FROM locality_request WHERE query_key = %s", (key,)
        ).fetchone()["n"]
    # The count is returned so the page can say "you're not the first", which
    # is true and harmless: it reveals how often a place was asked for, never who.
    return {"recorded": True, "times_requested": asked}
