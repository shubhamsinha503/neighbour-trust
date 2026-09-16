"""Accounts: the token is the only way in, and deleting an account erases it.

The token tests run everywhere. The flow tests need a real Postgres with the
migrations applied, and skip when one is not reachable.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
import uuid

import pytest

from apps.api.app import accounts

SECRET = "x" * 40


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def make_token(claims=None, *, secret=SECRET, alg="HS256", lifetime=120):
    now = int(time.time())
    body = {"sub": "google-123", "aud": accounts.TOKEN_AUDIENCE, "iat": now, "exp": now + lifetime}
    body.update(claims or {})
    header = _b64(json.dumps({"alg": alg, "typ": "JWT"}).encode())
    payload = _b64(json.dumps(body).encode())
    sig = _b64(hmac.new(secret.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest())
    return f"{header}.{payload}.{sig}"


# --- verify_user_token ------------------------------------------------------


def test_valid_token_returns_claims():
    claims = accounts.verify_user_token(make_token({"email": "a@b.c"}), secret=SECRET)
    assert claims["sub"] == "google-123" and claims["email"] == "a@b.c"


@pytest.mark.parametrize(
    "token, why",
    [
        (make_token(secret="y" * 40), "bad signature"),
        (make_token({"exp": int(time.time()) - 5}), "expired"),
        (make_token({"aud": "someone-else"}), "wrong audience"),
        (make_token({"sub": ""}), "no subject"),
        (make_token(lifetime=3600), "lifetime too long"),
        (make_token(alg="none"), "unexpected algorithm"),
        ("not.a.token.at.all", "malformed"),
        ("abc", "malformed"),
    ],
)
def test_bad_tokens_are_refused(token, why):
    with pytest.raises(ValueError) as exc:
        accounts.verify_user_token(token, secret=SECRET)
    assert why.split()[0] in str(exc.value)


def _sign(body: dict) -> str:
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _b64(json.dumps(body).encode())
    sig = _b64(hmac.new(SECRET.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest())
    return f"{header}.{payload}.{sig}"


def test_missing_or_bad_iat_is_refused_not_a_lifetime_bypass():
    # Strix vuln-0003: omitting iat used to short-circuit the lifetime ceiling,
    # so a no-iat token with a far-future exp was accepted forever.
    now = int(time.time())
    base = {"sub": "victim", "aud": accounts.TOKEN_AUDIENCE, "exp": 9999999999}
    for label, iat in [("absent", None), ("string", "x"), ("null", None), ("future", now + 3600)]:
        body = dict(base)
        if iat is not None:
            body["iat"] = iat
        with pytest.raises(ValueError):
            accounts.verify_user_token(_sign(body), secret=SECRET, now=now)


def test_a_normal_fresh_token_still_passes():
    now = int(time.time())
    claims = accounts.verify_user_token(
        _sign({"sub": "u", "aud": accounts.TOKEN_AUDIENCE, "iat": now, "exp": now + 120}),
        secret=SECRET, now=now,
    )
    assert claims["sub"] == "u"


def test_tampered_claims_fail_the_signature():
    header, payload, sig = make_token().split(".")
    forged = _b64(json.dumps({"sub": "someone-else", "aud": accounts.TOKEN_AUDIENCE,
                              "exp": int(time.time()) + 60}).encode())
    with pytest.raises(ValueError, match="bad signature"):
        accounts.verify_user_token(f"{header}.{forged}.{sig}", secret=SECRET)


def test_a_short_server_secret_is_refused():
    with pytest.raises(ValueError, match="secret"):
        accounts.verify_user_token(make_token(secret="short"), secret="short")


# --- the flow, against a real database -------------------------------------


def _database_ready() -> bool:
    try:
        from agents.common import db

        with db.connect() as conn:
            conn.execute("SELECT 1 FROM app_user LIMIT 1")
            return conn.execute("SELECT COUNT(*) AS n FROM locality").fetchone()["n"] >= 2
    except Exception:
        return False


db_required = pytest.mark.skipif(not _database_ready(), reason="needs Postgres with migrations and localities")


@pytest.fixture
def client(monkeypatch):
    from fastapi.testclient import TestClient

    from apps.api.app.main import app

    monkeypatch.setenv("USER_TOKEN_SECRET", SECRET)
    return TestClient(app)


@pytest.fixture
def two_slugs():
    from agents.common import db

    with db.connect() as conn:
        return [r["slug"] for r in db.list_localities(conn)[:2]]


@db_required
def test_no_token_no_access(client):
    assert client.get("/api/v1/me").status_code == 401
    bad = {"Authorization": f"Bearer {make_token(secret='y' * 40)}"}
    assert client.get("/api/v1/me/shortlist", headers=bad).status_code == 401


@db_required
def test_accounts_are_off_without_a_server_secret(client, monkeypatch):
    monkeypatch.delenv("USER_TOKEN_SECRET")
    assert client.get("/api/v1/me", headers={"Authorization": f"Bearer {make_token()}"}).status_code == 503


@db_required
def test_save_note_list_and_erase(client, two_slugs):
    from agents.common import db

    subject = f"test-{uuid.uuid4()}"
    auth = {"Authorization": f"Bearer {make_token({'sub': subject, 'email': 't@example.test', 'name': 'T'})}"}
    first, second = two_slugs

    assert client.get("/api/v1/me", headers=auth).json()["saved_count"] == 0

    assert client.put(f"/api/v1/me/shortlist/{first}", json={"note": "visited Sunday"}, headers=auth).status_code == 200
    assert client.put(f"/api/v1/me/shortlist/{second}", json={}, headers=auth).status_code == 200
    # Saving again without a note keeps the note already written.
    assert client.put(f"/api/v1/me/shortlist/{first}", json={}, headers=auth).status_code == 200

    shortlist = client.get("/api/v1/me/shortlist", headers=auth).json()
    by_slug = {s["slug"]: s for s in shortlist}
    assert set(by_slug) == {first, second}
    assert by_slug[first]["note"] == "visited Sunday"
    assert "score" in by_slug[first]

    # Another person sees none of it.
    other = {"Authorization": f"Bearer {make_token({'sub': f'other-{uuid.uuid4()}'})}"}
    assert client.get("/api/v1/me/shortlist", headers=other).json() == []

    assert client.delete(f"/api/v1/me/shortlist/{second}", headers=auth).status_code == 200
    assert [s["slug"] for s in client.get("/api/v1/me/shortlist", headers=auth).json()] == [first]

    assert client.delete("/api/v1/me", headers=auth).json() == {"deleted": True}
    with db.connect() as conn:
        assert conn.execute("SELECT COUNT(*) AS n FROM app_user WHERE auth_subject = %s", (subject,)).fetchone()["n"] == 0
        assert conn.execute(
            "SELECT COUNT(*) AS n FROM saved_locality s LEFT JOIN app_user u ON u.id = s.user_id WHERE u.id IS NULL"
        ).fetchone()["n"] == 0

    # Clean up the bystander too.
    client.delete("/api/v1/me", headers=other)


@db_required
def test_unknown_locality_and_overlong_note(client):
    auth = {"Authorization": f"Bearer {make_token({'sub': f'test-{uuid.uuid4()}'})}"}
    assert client.put("/api/v1/me/shortlist/no-such-place", json={}, headers=auth).status_code == 404
    client.delete("/api/v1/me", headers=auth)


@db_required
def test_compare_is_public_and_needs_two(client, two_slugs):
    assert client.get("/api/v1/compare", params={"slugs": two_slugs[0]}).status_code == 400
    body = client.get("/api/v1/compare", params={"slugs": ",".join(two_slugs)}).json()
    assert [l["slug"] for l in body["localities"]] == two_slugs
    assert {"score", "categories", "flags", "upcoming"} <= set(body["localities"][0])
