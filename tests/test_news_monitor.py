"""Tests for news fetching and classification.

The classifier tests use the actual headlines GDELT returned for "Indiranagar"
during development, because those are what motivated having a classifier at all.
"""

from datetime import datetime, timezone

import pytest

from agents.news_monitor.classify import HeuristicClassifier, _clean_type
from agents.news_monitor.sources.gdelt import _parse, _parse_seendate


class TestHeuristicClassifier:
    def setup_method(self):
        self.c = HeuristicClassifier()

    def judge(self, title, locality="Indiranagar", city="Bengaluru", category="crime"):
        return self.c.classify(
            title=title, locality=locality, city=city, category=category
        )

    def test_rejects_headline_that_does_not_name_the_locality(self):
        """The real failure: GDELT matched on article body, so a Maharashtra
        stabbing surfaced under an Indiranagar query."""
        result = self.judge("Engaged woman stabbed to death by ex live-in partner in Maharashtra")
        assert result is not None
        assert result.is_locality_specific is False

    def test_rejects_policy_coverage(self):
        """City/state policy stories name localities constantly without being
        incidents — the failure mode docs/strategy.md calls out by name."""
        result = self.judge("Karnataka CM announces new policing budget for Indiranagar ward")
        assert result is not None
        assert result.is_locality_specific is False
        assert "policy" in result.reason

    def test_accepts_a_named_local_incident(self):
        result = self.judge("Chain snatching reported near Indiranagar metro station")
        assert result is not None
        assert result.is_locality_specific is True
        assert result.incident_type == "theft"

    def test_water_incident(self):
        result = self.judge(
            "Sushant Lok residents face water shortage for third day",
            locality="Sushant Lok",
            city="Gurugram",
            category="water",
        )
        assert result is not None
        assert result.is_locality_specific is True
        assert result.incident_type == "shortage"

    def test_declines_on_ambiguous_headline(self):
        """Locality named, no policy marker, no incident vocabulary. The
        heuristic must return None rather than guess — an undecided mention is
        excluded from counts, which costs recall but never correctness."""
        assert self.judge("Indiranagar footpaths shrink under encroachments") is None

    def test_case_insensitive(self):
        assert self.judge("THEFT REPORTED IN INDIRANAGAR") is not None

    def test_unknown_category_declines(self):
        """No incident vocabulary defined, so nothing can be confirmed."""
        assert self.judge("Something happened in Indiranagar", category="power") is None


class TestIncidentTypeCleaning:
    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("Water Shortage", "water_shortage"),
            ("theft", "theft"),
            ("chain-snatching!", "chain_snatching"),
            ("", None),
            (None, None),
            (123, None),
        ],
    )
    def test_clean_type(self, raw, expected):
        assert _clean_type(raw) == expected


class TestGdeltParsing:
    BASE = {
        "url": "https://example.com/story",
        "title": "Theft reported in Indiranagar",
        "domain": "example.com",
        "language": "English",
        "sourcecountry": "India",
        "seendate": "20260804T031500Z",
    }

    def test_parses_a_good_article(self):
        parsed = _parse(dict(self.BASE), query_term="test")
        assert parsed is not None
        assert parsed["url"] == self.BASE["url"]
        assert parsed["published_at"] == datetime(2026, 8, 4, 3, 15, tzinfo=timezone.utc)

    def test_drops_article_without_url(self):
        assert _parse({**self.BASE, "url": ""}, query_term="t") is None

    def test_drops_article_without_title(self):
        assert _parse({**self.BASE, "title": "  "}, query_term="t") is None

    def test_tolerates_missing_optional_fields(self):
        parsed = _parse(
            {"url": "https://e.com/a", "title": "A story"}, query_term="t"
        )
        assert parsed is not None
        assert parsed["domain"] is None
        assert parsed["published_at"] is None

    @pytest.mark.parametrize("raw", ["", None, "not-a-date", "2026-08-04"])
    def test_bad_seendate_is_none_not_an_error(self, raw):
        assert _parse_seendate(raw) is None
