"""The visit counter's abuse ceiling.

Only the in-memory rate limit is exercised here — it is pure and needs no
database. The increment SQL is a single atomic UPDATE ... RETURNING, tested by
the migration running and the endpoint answering, not mocked here.
"""

import importlib


def _fresh():
    """A module with empty rate-limit state, isolated from other tests."""
    import apps.api.app.visits as visits

    importlib.reload(visits)
    return visits


def test_per_client_cap_blocks_one_noisy_client(monkeypatch):
    visits = _fresh()
    monkeypatch.setattr(visits, "PER_CLIENT_PER_MINUTE", 3)
    monkeypatch.setattr(visits, "GLOBAL_PER_MINUTE", 1000)

    now = 1_000.0
    assert [visits.allowed("1.2.3.4", now) for _ in range(4)] == [True, True, True, False]
    # A different client is unaffected by the first one's spending.
    assert visits.allowed("9.9.9.9", now) is True


def test_global_cap_bounds_total_regardless_of_client_key(monkeypatch):
    visits = _fresh()
    monkeypatch.setattr(visits, "PER_CLIENT_PER_MINUTE", 1000)
    monkeypatch.setattr(visits, "GLOBAL_PER_MINUTE", 2)

    now = 2_000.0
    # Each call claims a fresh client, which defeats the per-client cap — the
    # global cap is what still holds the line.
    assert visits.allowed("a", now) is True
    assert visits.allowed("b", now) is True
    assert visits.allowed("c", now) is False


def test_windows_are_a_rolling_minute(monkeypatch):
    visits = _fresh()
    monkeypatch.setattr(visits, "PER_CLIENT_PER_MINUTE", 1)
    monkeypatch.setattr(visits, "GLOBAL_PER_MINUTE", 1000)

    assert visits.allowed("1.2.3.4", 0.0) is True
    assert visits.allowed("1.2.3.4", 30.0) is False
    # Just past sixty seconds the earlier hit has aged out.
    assert visits.allowed("1.2.3.4", 61.0) is True
