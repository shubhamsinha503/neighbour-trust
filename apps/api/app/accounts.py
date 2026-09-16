"""Signed-in people and what they save: shortlist, private notes, compare.

**Who is allowed to call this.** The browser never talks to these endpoints.
Sign-in happens in the Next.js app (Google, via next-auth); its server reads the
session and calls here with a short-lived token it signs with a secret shared
only between the two servers. So the API stays GET-only for browsers, and a page
on another site cannot make it write anything on a visitor's behalf.

The token is a compact JWS, HS256, verified with the standard library rather
than a JWT package: the whole format is three base64url parts and one HMAC, and
the claims checked are exactly `sub`, `exp` and `aud`. Anything else about the
token is rejected rather than interpreted.

**What is stored.** See infra/migrations/009_user_accounts.sql: the Google
account id, the email and name shown at sign-in, and the localities someone
saves with their notes. Deleting the account deletes all of it, in one
statement, by cascade.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from agents.common import db
from agents.orchestrator import agent as orchestrator
from agents.orchestrator import score as score_mod

router = APIRouter()

TOKEN_AUDIENCE = "neighbour-trust-api"

# A token outlives one server-to-server request by a little, never by a session.
MAX_TOKEN_LIFETIME_SECONDS = 300

MAX_NOTE_CHARS = 2000
MAX_SHORTLIST = 50
MAX_COMPARE = 4


# ---------------------------------------------------------------------------
# Token verification
# ---------------------------------------------------------------------------


def _b64url_decode(part: str) -> bytes:
    return base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))


def verify_user_token(token: str, *, secret: str, now: Optional[float] = None) -> dict[str, Any]:
    """Return the claims of a valid token, or raise ValueError saying why not."""
    if not secret or len(secret) < 32:
        raise ValueError("server secret missing or too short")
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("malformed token")
    header_b64, payload_b64, signature_b64 = parts

    try:
        header = json.loads(_b64url_decode(header_b64))
    except Exception as exc:
        raise ValueError("unreadable header") from exc
    # Refusing anything but HS256 is what stops "alg: none" and algorithm
    # confusion; the header is checked before the signature is trusted.
    if header.get("alg") != "HS256":
        raise ValueError("unexpected algorithm")

    expected = hmac.new(
        secret.encode(), f"{header_b64}.{payload_b64}".encode(), hashlib.sha256
    ).digest()
    try:
        given = _b64url_decode(signature_b64)
    except Exception as exc:
        raise ValueError("unreadable signature") from exc
    if not hmac.compare_digest(expected, given):
        raise ValueError("bad signature")

    try:
        claims = json.loads(_b64url_decode(payload_b64))
    except Exception as exc:
        raise ValueError("unreadable claims") from exc

    current = time.time() if now is None else now
    exp, iat = claims.get("exp"), claims.get("iat")
    if not isinstance(exp, (int, float)) or exp < current:
        raise ValueError("expired")
    # `iat` is required and must be numeric. A missing or non-numeric `iat`
    # used to short-circuit this check (`isinstance(iat, ...) and ...` is False
    # when iat is absent), so a token with no iat and a far-future exp slipped
    # past the lifetime ceiling entirely. The minter always sets iat, so
    # demanding it costs a legitimate caller nothing.
    if not isinstance(iat, (int, float)):
        raise ValueError("no issued-at")
    if iat > current + 60:
        # Issued in the future beyond a minute of clock skew — not a token this
        # server's minter produces.
        raise ValueError("issued in the future")
    if exp - iat > MAX_TOKEN_LIFETIME_SECONDS:
        raise ValueError("lifetime too long")
    if claims.get("aud") != TOKEN_AUDIENCE:
        raise ValueError("wrong audience")
    if not isinstance(claims.get("sub"), str) or not claims["sub"]:
        raise ValueError("no subject")
    return claims


def _current_user(authorization: Optional[str]) -> dict[str, Any]:
    """Resolve the bearer token to a stored user, creating them on first use."""
    secret = os.environ.get("USER_TOKEN_SECRET", "")
    if not secret:
        # Accounts are simply off until the secret is configured, rather than
        # half-working with a default anyone could read in the source.
        raise HTTPException(status_code=503, detail="Accounts are not enabled.")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Sign in first.")
    try:
        claims = verify_user_token(authorization[7:], secret=secret)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Sign in again.") from exc

    with db.connect() as conn:
        row = conn.execute(
            """
            INSERT INTO app_user (auth_provider, auth_subject, email, display_name)
            VALUES ('google', %s, %s, %s)
            ON CONFLICT (auth_provider, auth_subject) DO UPDATE SET
                email        = EXCLUDED.email,
                display_name = EXCLUDED.display_name,
                last_seen_at = now()
            RETURNING id, email, display_name, created_at
            """,
            (claims["sub"], claims.get("email"), claims.get("name")),
        ).fetchone()
    return dict(row)


# ---------------------------------------------------------------------------
# Response shapes
# ---------------------------------------------------------------------------


class Me(BaseModel):
    email: Optional[str] = None
    display_name: Optional[str] = None
    created_at: str
    saved_count: int


class SavedLocality(BaseModel):
    slug: str
    name: str
    city: str
    note: str
    saved_at: str
    updated_at: str
    score: Optional[int] = None
    scored_categories: list[str] = []
    top_flag: Optional[dict[str, Any]] = None


class SaveRequest(BaseModel):
    note: Optional[str] = Field(None, max_length=MAX_NOTE_CHARS)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/api/v1/me", response_model=Me)
def get_me(authorization: Optional[str] = Header(None)) -> dict[str, Any]:
    user = _current_user(authorization)
    with db.connect() as conn:
        count = conn.execute(
            "SELECT COUNT(*) AS n FROM saved_locality WHERE user_id = %s", (user["id"],)
        ).fetchone()["n"]
    return {
        "email": user["email"],
        "display_name": user["display_name"],
        "created_at": user["created_at"].isoformat(),
        "saved_count": count,
    }


@router.get("/api/v1/me/shortlist", response_model=list[SavedLocality])
def get_shortlist(authorization: Optional[str] = Header(None)) -> list[dict[str, Any]]:
    """Saved localities, newest first, each with its current score and worst flag.

    Scores are computed now rather than remembered from when it was saved: a
    shortlist that showed last month's number would be quietly out of date on
    the one page someone uses to decide.
    """
    user = _current_user(authorization)
    out: list[dict[str, Any]] = []
    with db.connect() as conn:
        rows = conn.execute(
            """
            SELECT l.id, l.slug, l.name, l.city, l.state, l.pincode, l.h3_cell,
                   ST_Y(l.centroid::geometry) AS lat, ST_X(l.centroid::geometry) AS lon,
                   s.note, s.created_at AS saved_at, s.updated_at
              FROM saved_locality s
              JOIN locality l ON l.id = s.locality_id
             WHERE s.user_id = %s
             ORDER BY s.created_at DESC
            """,
            (user["id"],),
        ).fetchall()
        for row in rows:
            report = orchestrator.build_report(conn, row)
            out.append(
                {
                    "slug": row["slug"],
                    "name": row["name"],
                    "city": row["city"],
                    "note": row["note"],
                    "saved_at": row["saved_at"].isoformat(),
                    "updated_at": row["updated_at"].isoformat(),
                    "score": report.trust_score.score,
                    "scored_categories": [
                        score_mod.LABELS.get(c.category, c.category)
                        for c in report.trust_score.categories
                        if c.counted
                    ],
                    "top_flag": report.flags[0] if report.flags else None,
                }
            )
    return out


@router.put("/api/v1/me/shortlist/{slug}")
def save_locality(
    slug: str, body: SaveRequest, authorization: Optional[str] = Header(None)
) -> dict[str, Any]:
    """Save a locality, or update its note. Saving twice is not an error."""
    user = _current_user(authorization)
    with db.connect() as conn:
        locality = db.get_locality(conn, slug)
        if locality is None:
            raise HTTPException(status_code=404, detail=f"unknown locality: {slug}")
        count = conn.execute(
            "SELECT COUNT(*) AS n FROM saved_locality WHERE user_id = %s AND locality_id <> %s",
            (user["id"], locality["id"]),
        ).fetchone()["n"]
        if count >= MAX_SHORTLIST:
            raise HTTPException(
                status_code=409,
                detail=f"A shortlist holds up to {MAX_SHORTLIST} localities. Remove one first.",
            )
        note = (body.note or "").strip()
        conn.execute(
            """
            INSERT INTO saved_locality (user_id, locality_id, note)
            VALUES (%s, %s, %s)
            ON CONFLICT (user_id, locality_id) DO UPDATE SET
                note       = CASE WHEN %s THEN EXCLUDED.note ELSE saved_locality.note END,
                updated_at = now()
            """,
            # A save without a note must not wipe a note already written.
            (user["id"], locality["id"], note, body.note is not None),
        )
    return {"saved": True, "slug": slug}


@router.delete("/api/v1/me/shortlist/{slug}")
def unsave_locality(slug: str, authorization: Optional[str] = Header(None)) -> dict[str, Any]:
    user = _current_user(authorization)
    with db.connect() as conn:
        conn.execute(
            """
            DELETE FROM saved_locality s
             USING locality l
             WHERE s.locality_id = l.id AND l.slug = %s AND s.user_id = %s
            """,
            (slug, user["id"]),
        )
    return {"saved": False, "slug": slug}


@router.delete("/api/v1/me")
def delete_account(authorization: Optional[str] = Header(None)) -> dict[str, Any]:
    """Erase the account and everything saved under it.

    One DELETE; saved_locality goes with it by ON DELETE CASCADE. Nothing is
    kept "in case": the privacy page promises erasure, not deactivation.
    """
    user = _current_user(authorization)
    with db.connect() as conn:
        conn.execute("DELETE FROM app_user WHERE id = %s", (user["id"],))
    return {"deleted": True}


@router.get("/api/v1/compare")
def compare(slugs: str) -> dict[str, Any]:
    """Two to four localities side by side. Public, since every report is.

    Not tied to an account so a comparison can be forwarded to family as a
    link — the same reason the reports themselves need no sign-in.
    """
    wanted = [s.strip() for s in slugs.split(",") if s.strip()]
    wanted = list(dict.fromkeys(wanted))[:MAX_COMPARE]
    if len(wanted) < 2:
        raise HTTPException(status_code=400, detail="Choose at least two localities to compare.")

    out: list[dict[str, Any]] = []
    with db.connect() as conn:
        for slug in wanted:
            locality = db.get_locality(conn, slug)
            if locality is None:
                continue
            report = orchestrator.build_report(conn, locality)
            trust = report.trust_score
            out.append(
                {
                    "slug": locality["slug"],
                    "name": locality["name"],
                    "city": locality["city"],
                    "score": trust.score,
                    "categories_counted": trust.categories_counted,
                    "categories_total": trust.categories_total,
                    "verdict": report.verdict,
                    "categories": [
                        {
                            "category": c["category"],
                            "label": c["label"],
                            "score": c["score"],
                            "available": c["available"],
                            "is_baseline": c["is_baseline"],
                            "summary": c["summary"],
                        }
                        for c in report.categories
                    ],
                    "flags": report.flags[:3],
                    "upcoming": report.upcoming[:2],
                }
            )
    if len(out) < 2:
        raise HTTPException(status_code=404, detail="Could not find enough of those localities.")
    return {"localities": out}
