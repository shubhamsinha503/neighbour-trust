"""The Q&A agent's guarantees: grounded, cited, and silent when it should be."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from agents.orchestrator import qa


def _sources():
    return [
        qa.Source(id=1, kind="locality", text="Hebbal is a locality in Bengaluru."),
        qa.Source(id=2, kind="category", text="Air quality scores 86 out of 100.", label="OpenAQ"),
        qa.Source(id=3, kind="category_absent", text="There is no water data on record."),
    ]


class FakeClient:
    name = "fake"

    def __init__(self, raw):
        self.raw = raw
        self.seen = None

    def ask(self, *, question, sources):
        self.seen = (question, sources)
        return self.raw


# --- validate ---------------------------------------------------------------


def test_real_citations_survive():
    answer = qa.validate(
        {"answerable": True, "answer": "Air quality scores 86 [2].", "citations": [2]},
        _sources(), "fake",
    )
    assert answer.answerable
    assert [c.id for c in answer.citations] == [2]
    assert "[2]" in answer.text


def test_invented_citation_is_removed_from_list_and_prose():
    answer = qa.validate(
        {"answerable": True, "answer": "Air scores 86 [2]. Crime is low [9].", "citations": [2, 9]},
        _sources(), "fake",
    )
    assert [c.id for c in answer.citations] == [2]
    assert "[9]" not in answer.text
    assert answer.dropped_citations == [9]


def test_grounded_claim_with_only_invented_citations_becomes_a_refusal():
    # A confident answer citing nothing real is the model answering from its
    # own idea of Bengaluru. That must never reach a reader as a finding.
    answer = qa.validate(
        {"answerable": True, "answer": "It is very safe [12].", "citations": [12]},
        _sources(), "fake",
    )
    assert not answer.answerable
    assert answer.citations == []
    assert "safe" not in answer.text.lower()


def test_uncited_grounded_answer_becomes_a_refusal():
    answer = qa.validate(
        {"answerable": True, "answer": "The water supply is reliable.", "citations": []},
        _sources(), "fake",
    )
    assert not answer.answerable
    assert "reliable" not in answer.text


def test_citations_in_prose_count_even_if_list_omits_them():
    answer = qa.validate(
        {"answerable": True, "answer": "Scores 86 [2].", "citations": []},
        _sources(), "fake",
    )
    assert answer.answerable
    assert [c.id for c in answer.citations] == [2]


def test_refusal_carries_no_citations():
    answer = qa.validate(
        {"answerable": False, "answer": "We hold no water data for Hebbal [3].", "citations": [3]},
        _sources(), "fake",
    )
    assert not answer.answerable
    assert answer.citations == []
    assert "water" in answer.text
    assert "[3]" not in answer.text
    assert answer.text == "We hold no water data for Hebbal."


@pytest.mark.parametrize("raw", [None, "nonsense", {}])
def test_broken_model_output_is_a_refusal_not_a_crash(raw):
    answer = qa.validate(raw, _sources(), "fake")
    assert not answer.answerable
    assert answer.citations == []


# --- ask -----------------------------------------------------------------


def test_empty_question_never_calls_the_model(monkeypatch):
    client = FakeClient({"answerable": True, "answer": "x [1]", "citations": [1]})
    monkeypatch.setattr(qa, "assemble", lambda conn, loc: pytest.fail("assembled"))
    answer = qa.ask(None, {"slug": "hebbal"}, "   ", client)
    assert not answer.answerable
    assert client.seen is None


def test_long_question_is_truncated_before_the_model_sees_it(monkeypatch):
    client = FakeClient({"answerable": False, "answer": "No.", "citations": []})
    monkeypatch.setattr(qa, "assemble", lambda conn, loc: _sources())
    qa.ask(None, {"slug": "hebbal"}, "x" * 5000, client)
    assert len(client.seen[0]) == qa.MAX_QUESTION_CHARS


# --- assemble ------------------------------------------------------------


def _fake_report():
    trust = SimpleNamespace(score=74, categories_counted=2, categories_total=5)
    return SimpleNamespace(
        trust_score=trust,
        categories=[
            {"category": "air_quality", "label": "Air quality", "available": True,
             "score": 86, "summary": "PM2.5 low.", "source_name": "OpenAQ",
             "data_vintage": "2026-09-12T13:00:00+00:00", "is_baseline": False},
            {"category": "water", "label": "Water", "available": False, "score": None},
            {"category": "crime", "label": "Safety", "available": True, "score": 80,
             "summary": "", "source_name": None, "data_vintage": None, "is_baseline": True},
        ],
        flags=[{"severity": "serious", "headline": "Waterlogging reported 3 times", "detail": "Press."}],
        disagreements=[SimpleNamespace(headline="Two AQI numbers", detail="CPCB 90, AQICN 140")],
        upcoming=[{"headline": "Metro line delayed", "url": "https://x", "source": "TOI",
                   "published_at": "2026-07-01T00:00:00Z", "kind": "metro_line"}],
    )


@pytest.fixture
def assembled(monkeypatch):
    def incidents(conn, *, h3_cell, category):
        if category != "crime":
            return []
        return [{"title": "Chain snatching near Hebbal flyover", "url": "https://n",
                 "domain": "deccanherald.com",
                 "published_at": datetime(2026, 8, 1, tzinfo=timezone.utc)}]

    def reports(conn, *, h3_cell):
        return [{"category": "water", "body": "Tanker every week in summer",
                 "basis": "happened_to_me", "tie_to_area": "lives_here",
                 "submitted_at": datetime(2026, 9, 1, tzinfo=timezone.utc)}]

    monkeypatch.setattr(qa.orchestrator, "build_report", lambda conn, loc: _fake_report())
    monkeypatch.setattr(qa.db, "confirmed_incidents", incidents)
    monkeypatch.setattr(qa.db, "accepted_reports", reports)
    return qa.assemble(None, {"slug": "hebbal", "name": "Hebbal", "city": "Bengaluru", "h3_cell": "x"})


def test_ids_are_sequential_from_one(assembled):
    assert [s.id for s in assembled] == list(range(1, len(assembled) + 1))


def test_absent_category_is_stated_as_absence_not_as_good_news(assembled):
    water = next(s for s in assembled if s.kind == "category_absent")
    assert "no water data" in water.text.lower()
    assert "not the same as nothing being wrong" in water.text


def test_baseline_is_labelled_as_not_a_measurement(assembled):
    safety = next(s for s in assembled if s.kind == "category" and "Safety" in s.text)
    assert "rather than a measurement" in safety.text
    assert "  " not in safety.text


def test_every_kind_of_evidence_reaches_the_prompt(assembled):
    kinds = {s.kind for s in assembled}
    assert {"locality", "trust_score", "category", "category_absent", "flag",
            "disagreement", "upcoming", "headline", "resident_report"} <= kinds


def test_headlines_are_quoted_verbatim_with_their_link(assembled):
    headline = next(s for s in assembled if s.kind == "headline")
    assert '"Chain snatching near Hebbal flyover"' in headline.text
    assert headline.url == "https://n"
    assert headline.vintage == "2026-08-01"


def test_upcoming_is_framed_as_a_report_not_a_commitment(assembled):
    upcoming = next(s for s in assembled if s.kind == "upcoming")
    assert "not a commitment" in upcoming.text
    assert upcoming.vintage == "2026-07-01"


def test_resident_report_is_framed_as_evidence(assembled):
    report = next(s for s in assembled if s.kind == "resident_report")
    assert "evidence, not a measurement" in report.text


def test_prompt_forbids_derived_numbers_and_absence_as_finding():
    prompt = qa.SYSTEM_PROMPT.lower()
    assert "never state a number that is not written in a source" in prompt
    assert "absence is not a finding" in prompt


# --- the endpoint's limits -------------------------------------------------


def test_rate_limits(monkeypatch):
    from apps.api.app import main

    monkeypatch.setattr(main, "_ASK_PER_CLIENT", 2)
    monkeypatch.setattr(main, "_ASK_PER_DAY", 3)
    main._ask_hits.clear()
    main._ask_day.update(date=None, count=0)

    assert main._ask_allowed("a") is None
    assert main._ask_allowed("a") is None
    assert "hour" in main._ask_allowed("a")
    assert main._ask_allowed("b") is None
    assert "today" in main._ask_allowed("c")


def test_openai_compatible_client_retries_once(monkeypatch):
    client = qa.OpenAICompatibleQaClient.__new__(qa.OpenAICompatibleQaClient)
    client.RETRY_AFTER_SECONDS = 0
    calls = []

    def once(*, question, sources):
        calls.append(1)
        return None if len(calls) == 1 else {"answerable": False, "answer": "No.", "citations": []}

    client._ask_once = once
    assert client.ask(question="q", sources=[]) == {"answerable": False, "answer": "No.", "citations": []}
    assert len(calls) == 2


def test_openai_compatible_client_gives_up_after_one_retry():
    client = qa.OpenAICompatibleQaClient.__new__(qa.OpenAICompatibleQaClient)
    client.RETRY_AFTER_SECONDS = 0
    calls = []
    client._ask_once = lambda *, question, sources: calls.append(1)
    assert client.ask(question="q", sources=[]) is None
    assert len(calls) == 2


def test_connectivity_source_says_rail_and_metro_are_not_distinguished(monkeypatch):
    report = _fake_report()
    report.categories.append({"category": "infrastructure", "label": "Connectivity", "available": True,
                              "score": 75, "summary": "nearest station 1.39 km (Hebbal)",
                              "source_name": "OpenStreetMap", "data_vintage": None, "is_baseline": False})
    monkeypatch.setattr(qa.orchestrator, "build_report", lambda conn, loc: report)
    monkeypatch.setattr(qa.db, "confirmed_incidents", lambda conn, *, h3_cell, category: [])
    monkeypatch.setattr(qa.db, "accepted_reports", lambda conn, *, h3_cell: [])
    sources = qa.assemble(None, {"slug": "hebbal", "name": "Hebbal", "city": "Bengaluru", "h3_cell": "x"})
    connectivity = next(s for s in sources if s.text.startswith("Connectivity"))
    assert "railway and metro stations together" in connectivity.text
    assert "does not say which kind" in connectivity.text
    assert "1.39 km" in connectivity.text
