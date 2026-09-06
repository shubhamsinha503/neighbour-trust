"""Tests for read-time confidence decay.

Both bugs these cover were live in the API on 2026-08-31, so each test names the
real case rather than an invented one.
"""

from datetime import datetime, timedelta, timezone

import pytest

from agents.common import freshness
from neighbour_trust_schema.envelope import Confidence

NOW = datetime(2026, 8, 31, 9, 0, tzinfo=timezone.utc)


def at(**kwargs) -> datetime:
    return NOW - timedelta(**kwargs)


class TestAirQualityDecay:
    def test_the_bug_a_13_day_old_reading_is_not_medium(self):
        """The exact case observed: the API served confidence "medium" on a
        reading taken 2026-08-17, because confidence was frozen at write time."""
        result = freshness.evaluate(
            category="air_quality",
            stored_confidence=Confidence.MEDIUM,
            data_vintage=datetime(2026, 8, 17, 13, 30, tzinfo=timezone.utc),
            now=NOW,
        )
        assert result.confidence == Confidence.LOW
        assert result.historical is True
        assert result.reason is not None and "13 days" in result.reason

    def test_fresh_reading_keeps_its_stored_confidence(self):
        result = freshness.evaluate(
            category="air_quality",
            stored_confidence=Confidence.HIGH,
            data_vintage=at(hours=1),
            now=NOW,
        )
        assert result.confidence == Confidence.HIGH
        assert result.withhold is False
        assert result.degraded_from is None

    def test_past_three_hours_high_becomes_medium(self):
        result = freshness.evaluate(
            category="air_quality",
            stored_confidence=Confidence.HIGH,
            data_vintage=at(hours=5),
            now=NOW,
        )
        assert result.confidence == Confidence.MEDIUM
        assert result.degraded_from == Confidence.HIGH

    def test_past_a_day_everything_becomes_low(self):
        result = freshness.evaluate(
            category="air_quality",
            stored_confidence=Confidence.HIGH,
            data_vintage=at(hours=30),
            now=NOW,
        )
        assert result.confidence == Confidence.LOW

    def test_past_a_week_becomes_historical_rather_than_hidden(self):
        """Changed deliberately on 2026-09-06. This asserted the reading was
        withheld, and that would have blanked the air card for 19 localities
        when CPCB's network stopped publishing in late August — while a real,
        dated 31 August measurement sat in the database.

        "Last measured on 31 August" is more use to a buyer than an empty card,
        and it is not a lie as long as the date travels with it.
        """
        result = freshness.evaluate(
            category="air_quality",
            stored_confidence=Confidence.HIGH,
            data_vintage=at(days=8),
            now=NOW,
        )
        assert result.historical is True
        assert result.withhold is False
        assert result.confidence == Confidence.LOW

    def test_a_historical_reading_says_it_is_not_scored(self):
        """The card can caveat itself in words; a single 0-100 number cannot.
        The reason string is what the page shows, so it has to say so."""
        result = freshness.evaluate(
            category="air_quality",
            stored_confidence=Confidence.HIGH,
            data_vintage=at(days=8),
            now=NOW,
        )
        assert result.reason is not None
        assert "not counted" in result.reason
        assert "Trust Score" in result.reason

    def test_decay_never_raises_confidence(self):
        """A stale LOW reading must not become MEDIUM because the cap is MEDIUM."""
        result = freshness.evaluate(
            category="air_quality",
            stored_confidence=Confidence.LOW,
            data_vintage=at(hours=5),
            now=NOW,
        )
        assert result.confidence == Confidence.LOW


class TestSchools:
    def test_a_2022_survey_is_not_withheld(self):
        """Schools is stored at LOW and stays useful — "here are the schools,
        staffing is from 2022" remains true rather than expiring."""
        result = freshness.evaluate(
            category="schools",
            stored_confidence=Confidence.LOW,
            data_vintage=datetime(2022, 1, 12, tzinfo=timezone.utc),
            now=NOW,
        )
        assert result.withhold is False
        assert result.confidence == Confidence.LOW


class TestUnknownCategory:
    def test_unconfigured_category_passes_through(self):
        """An agent added before its policy is written must not silently have its
        confidence altered."""
        result = freshness.evaluate(
            category="water",
            stored_confidence=Confidence.COMMUNITY_ESTIMATED,
            data_vintage=at(days=400),
            now=NOW,
        )
        assert result.withhold is False
        assert result.confidence == Confidence.COMMUNITY_ESTIMATED


class TestNaiveDatetimes:
    def test_naive_vintage_is_treated_as_utc(self):
        """Postgres can hand back a naive datetime depending on the driver path;
        comparing that against an aware `now` would raise rather than degrade."""
        result = freshness.evaluate(
            category="air_quality",
            stored_confidence=Confidence.HIGH,
            data_vintage=datetime(2026, 8, 31, 8, 0),
            now=NOW,
        )
        assert result.confidence == Confidence.HIGH
