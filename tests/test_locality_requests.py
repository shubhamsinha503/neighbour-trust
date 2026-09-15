"""Locality requests: anonymous, bounded, and counted."""

from __future__ import annotations

import uuid

import pytest

from apps.api.app import locality_requests as lr


def test_query_key_normalises_case_punctuation_and_spaces():
    assert lr.query_key("  Kharadi,   PUNE! ") == "kharadi pune"
    assert lr.query_key("Sector-62 (Noida)") == "sector 62 noida"


def test_rate_limit_is_per_client_and_per_hour(monkeypatch):
    monkeypatch.setattr(lr, "PER_CLIENT_PER_HOUR", 2)
    lr._hits.clear()
    assert lr.allowed("a", now=1000) and lr.allowed("a", now=1001)
    assert not lr.allowed("a", now=1002)
    assert lr.allowed("b", now=1002)
    assert lr.allowed("a", now=1000 + 3601)


def _database_ready() -> bool:
    try:
        from agents.common import db

        with db.connect() as conn:
            conn.execute("SELECT 1 FROM locality_request LIMIT 1")
        return True
    except Exception:
        return False


db_required = pytest.mark.skipif(not _database_ready(), reason="needs Postgres with migration 010")


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from apps.api.app.main import app

    lr._hits.clear()
    return TestClient(app)


@db_required
def test_request_is_stored_and_counted_without_anything_personal(client):
    from agents.common import db

    name = f"Testplace {uuid.uuid4().hex[:8]}"
    body = {"query": name, "city": "Bengaluru", "place_label": f"{name}, Bengaluru",
            "lat": 12.97, "lon": 77.59, "nearest_slug": "hebbal", "nearest_km": 3.2}
    first = client.post("/api/v1/locality-requests", json=body)
    second = client.post("/api/v1/locality-requests", json={"query": name.upper() + "!"})
    assert first.status_code == 200 and first.json()["times_requested"] == 1
    assert second.json()["times_requested"] == 2

    with db.connect() as conn:
        columns = {r["column_name"] for r in conn.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'locality_request'"
        ).fetchall()}
        assert not columns & {"email", "ip", "ip_address", "user_id", "phone"}
        conn.execute("DELETE FROM locality_request WHERE query_key = %s", (lr.query_key(name),))


@pytest.mark.parametrize("query", ["", "x", "https://spam.example", "www.spam.example", "a" * 121, "!!"])
@db_required
def test_junk_is_refused(client, query):
    assert client.post("/api/v1/locality-requests", json={"query": query}).status_code in (400, 422)


@db_required
def test_out_of_range_coordinates_are_refused(client):
    assert client.post("/api/v1/locality-requests", json={"query": "Somewhere", "lat": 200}).status_code == 422
