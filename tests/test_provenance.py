"""Every figure on the report must be traceable: source, date, confidence, link.

These cover the provenance attached to category tiles and flags, so a reader can
open the original from the thing that worried them rather than hunting for it.
"""

from datetime import datetime, timezone

from agents.orchestrator import agent


def _press_envelope(recent):
    return {
        "source_name": "Google News",
        "source_url": "https://news.google.com",
        "data_vintage": datetime(2026, 11, 2, tzinfo=timezone.utc),
        "fetched_at": datetime(2026, 11, 20, 6, 0, tzinfo=timezone.utc),
        "confidence": "community_estimated",
        "payload": {"news": {"incidents_12m": len(recent), "recent": recent}},
    }


def _article(title, day, kind="waterlogging", url=True):
    return {
        "title": title,
        "url": f"https://example.in/{day}" if url else "",
        "domain": "example.in",
        "published_at": f"2026-10-{day:02d}T00:00:00+00:00",
        "incident_type": kind,
    }


def test_evidence_lists_confirmed_articles_newest_first():
    env = _press_envelope([
        _article("old", 1), _article("new", 20), _article("mid", 10),
        _article("another", 5),
    ])
    out = agent._evidence("water", env)
    assert [e["headline"] for e in out] == ["new", "mid", "another"]
    assert out[0]["url"] == "https://example.in/20"
    assert out[0]["source"] == "example.in"
    assert out[0]["published_at"].startswith("2026-10-20")


def test_evidence_never_shows_unjudged_or_unlinked_mentions():
    env = _press_envelope([
        _article("unjudged", 3, kind=None),
        _article("no link", 4, url=False),
        _article("real", 2),
    ])
    assert [e["headline"] for e in agent._evidence("crime", env)] == ["real"]


def test_measured_categories_carry_no_press_evidence():
    env = _press_envelope([_article("x", 1)])
    assert agent._evidence("air_quality", env) == []
    assert agent._evidence("water", None) == []


def test_provenance_carries_source_date_and_confidence():
    env = _press_envelope([_article("a", 1)])
    p = agent._provenance("water", env)
    assert p["source_name"] == "Google News"
    assert p["source_url"] == "https://news.google.com"
    assert p["as_of"].startswith("2026-11-02")
    assert p["fetched_at"].startswith("2026-11-20")
    assert p["confidence"] == "community_estimated"
    assert len(p["evidence"]) == 1


def test_provenance_without_data_claims_nothing():
    p = agent._provenance("schools", None)
    assert p["source_name"] is None and p["as_of"] is None and p["evidence"] == []


def test_resident_flags_say_they_are_resident_accounts():
    reports = [
        {"submitted_at": datetime(2026, 9, 1, tzinfo=timezone.utc),
         "reviewed_at": datetime(2026, 9, 3, tzinfo=timezone.utc),
         "evidence_url": "https://photos.example/1", "incident_type": "waterlogging"},
        {"submitted_at": datetime(2026, 10, 1, tzinfo=timezone.utc),
         "reviewed_at": None, "evidence_url": None, "incident_type": None},
    ]
    p = agent._resident_provenance(reports)
    assert "Resident" in p["source_name"]
    assert p["confidence"] == "community_estimated"
    assert p["as_of"].startswith("2026-10-01")
    assert [e["url"] for e in p["evidence"]] == ["https://photos.example/1"]
