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
        assert result.withhold is True
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

    def test_past_a_week_is_withheld(self):
        result = freshness.evaluate(
            category="air_quality",
            stored_confidence=Confidence.HIGH,
            data_vintage=at(days=8),
            now=NOW,
        )
        assert result.withhold is True

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
