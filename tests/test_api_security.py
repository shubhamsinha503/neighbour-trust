"""Endpoint-level guards from the Strix review: rate limits and /debug access."""

from __future__ import annotations

import pytest

from apps.api.app import main


def test_ask_global_minute_cap_ignores_the_client_key(monkeypatch):
    # vuln-0002: varying x-forwarded-for must not unlock unlimited paid calls.
    monkeypatch.setattr(main, "_ASK_GLOBAL_PER_MINUTE", 3)
    monkeypatch.setattr(main, "_ASK_PER_CLIENT", 100)
    monkeypatch.setattr(main, "_ASK_PER_DAY", 10000)
    main._ask_hits.clear(); main._ask_recent.clear()
    main._ask_day.update(date=None, count=0)
    results = [main._ask_allowed(f"spoof-{i}") for i in range(5)]
    assert results[:3] == [None, None, None]
    assert all("minute" in r for r in results[3:])


def test_ask_daily_cap_is_global(monkeypatch):
    monkeypatch.setattr(main, "_ASK_GLOBAL_PER_MINUTE", 10000)
    monkeypatch.setattr(main, "_ASK_PER_CLIENT", 10000)
    monkeypatch.setattr(main, "_ASK_PER_DAY", 2)
    main._ask_hits.clear(); main._ask_recent.clear()
    main._ask_day.update(date=None, count=0)
    assert main._ask_allowed("a") is None
    assert main._ask_allowed("b") is None
    assert "today" in main._ask_allowed("c")


def _client():
    from fastapi.testclient import TestClient
    return TestClient(main.app, raise_server_exceptions=False)


def test_debug_endpoints_are_404_without_a_token(monkeypatch):
    monkeypatch.delenv("DEBUG_TOKEN", raising=False)
    c = _client()
    assert c.get("/debug/classification").status_code == 404
    assert c.get("/debug/report/hebbal").status_code == 404


def test_debug_endpoints_reject_a_wrong_token(monkeypatch):
    monkeypatch.setenv("DEBUG_TOKEN", "s3cret-operator-token")
    c = _client()
    assert c.get("/debug/classification", headers={"x-debug-token": "wrong"}).status_code == 404
    # No traceback leaks on the wrong token: the body is the plain 404.
    assert "traceback" not in c.get("/debug/report/hebbal", headers={"x-debug-token": "wrong"}).text
