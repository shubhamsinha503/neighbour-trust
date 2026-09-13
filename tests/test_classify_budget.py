"""Classification must keep its work when a run is cut short.

A single commit after the whole pass lost every judgement whenever the job
timed out, which on Groq's paced free tier was every run: the backlog stayed at
10,341 for four days.
"""

from __future__ import annotations

from agents.news_monitor import agent
from agents.news_monitor.classify import Judgement


class FakeConn:
    def __init__(self):
        self.commits = 0
        self.recorded = []

    def commit(self):
        self.commits += 1


class CountingClassifier:
    name = "fake"

    def __init__(self, clock=None, tick=0.0, decline_every=0):
        self.calls = 0
        self.clock = clock
        self.tick = tick
        self.decline_every = decline_every

    def classify(self, *, title, locality, city, category):
        self.calls += 1
        if self.clock is not None:
            self.clock.advance(self.tick)
        if self.decline_every and self.calls % self.decline_every == 0:
            return None
        return Judgement(is_locality_specific=self.calls % 2 == 0, incident_type=None,
                         reason="r", classifier="fake")


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t

    def advance(self, dt):
        self.t += dt


def _mentions(n):
    return [{"id": i, "title": f"t{i}", "locality": "L", "city": "C", "category": "crime"}
            for i in range(n)]


def _patch(monkeypatch, conn, n):
    monkeypatch.setattr(agent.db, "unclassified_mentions", lambda c, limit: _mentions(n)[:limit])
    monkeypatch.setattr(agent.db, "record_classification",
                        lambda c, mid, **kw: conn.recorded.append(mid))
    # One worker, so the fake clock advances in a predictable order.
    monkeypatch.setattr(agent, "CLASSIFY_CONCURRENCY", 1)


def test_commits_in_batches_not_once_at_the_end(monkeypatch):
    conn = FakeConn()
    _patch(monkeypatch, conn, 120)
    monkeypatch.setattr(agent, "COMMIT_EVERY", 50)
    result = agent.classify_pending(conn, CountingClassifier())
    assert result.judged == 120
    # 50, 100, then the remaining 20.
    assert conn.commits == 3


def test_stops_at_budget_and_defers_the_rest(monkeypatch):
    conn = FakeConn()
    clock = Clock()
    _patch(monkeypatch, conn, 100)
    classifier = CountingClassifier(clock=clock, tick=10.0)  # each call takes 10 s
    result = agent.classify_pending(conn, classifier, budget_seconds=250, clock=clock)
    assert result.judged == 25
    assert result.deferred == 75
    # Deferred mentions were never sent to the model.
    assert classifier.calls == 25
    assert conn.recorded == list(range(25))
    assert conn.commits >= 1


def test_declines_are_not_counted_as_deferred(monkeypatch):
    conn = FakeConn()
    _patch(monkeypatch, conn, 10)
    result = agent.classify_pending(conn, CountingClassifier(decline_every=5))
    assert result.undecided == 2
    assert result.deferred == 0
    assert result.judged == 8


def test_dry_run_never_commits(monkeypatch):
    conn = FakeConn()
    _patch(monkeypatch, conn, 120)
    monkeypatch.setattr(agent, "COMMIT_EVERY", 50)
    agent.classify_pending(conn, CountingClassifier(), commit=False)
    assert conn.commits == 0


def test_no_budget_means_no_deferral(monkeypatch):
    conn = FakeConn()
    _patch(monkeypatch, conn, 30)
    result = agent.classify_pending(conn, CountingClassifier())
    assert result.deferred == 0 and result.judged == 30
