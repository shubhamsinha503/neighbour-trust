"""Tests for the schools proxy score, confidence rule and coverage guard.

The scoring is opinionated, so the tests pin the properties that matter rather
than specific numbers: that it is a ratio (not a size) measure, that it refuses
to invent values, and that it cannot reach High confidence on data that doesn't
support it.
"""

from datetime import datetime, timedelta, timezone

import pytest

from agents.schools import coverage, scoring
from agents.schools.agent import assess_confidence
from agents.schools.sources.udise import _parse, _titleish
from neighbour_trust_schema.envelope import Confidence

NOW = datetime(2026, 8, 17, tzinfo=timezone.utc)
UDISE_2022 = datetime(2022, 1, 12, tzinfo=timezone.utc)


class TestRatios:
    def test_ptr_basic(self):
        assert scoring.pupil_teacher_ratio(600, 20) == 30.0

    def test_zero_teachers_is_unknown_not_infinitely_bad(self):
        """UDISE contains rows with 0 teachers; those are data gaps far more
        often than schools genuinely operating without staff."""
        assert scoring.pupil_teacher_ratio(600, 0) is None

    def test_missing_inputs_give_none(self):
        assert scoring.pupil_teacher_ratio(None, 20) is None
        assert scoring.students_per_room(500, None) is None


class TestProxyScore:
    def test_rte_norm_lands_mid_scale(self):
        """30:1 is the RTE Act's own limit — it should read as adequate, not good."""
        score = scoring.proxy_score(30.0, 35.0)
        assert 55 <= score <= 65

    def test_better_ratio_scores_higher(self):
        assert scoring.proxy_score(15.0, 20.0) > scoring.proxy_score(45.0, 50.0)

    def test_does_not_reward_size(self):
        """Two schools with identical ratios score identically regardless of
        how many pupils they have — otherwise the score just ranks by size."""
        small = scoring.proxy_score(scoring.pupil_teacher_ratio(40, 2), scoring.students_per_room(40, 2))
        large = scoring.proxy_score(scoring.pupil_teacher_ratio(900, 45), scoring.students_per_room(900, 45))
        assert small == large

    def test_single_component_is_used_alone(self):
        """Rather than assuming a neutral 50 for the missing half, which would be
        indistinguishable from a measured 50."""
        assert scoring.proxy_score(20.0, None) == 100.0

    def test_no_inputs_gives_none(self):
        assert scoring.proxy_score(None, None) is None

    def test_median_ignores_missing(self):
        assert scoring.median_or_none([10.0, None, 20.0]) == 15.0
        assert scoring.median_or_none([None, None]) is None


class TestConfidence:
    def test_2022_snapshot_is_low(self):
        """4.6 years old, far past the strategy doc's 18-month line."""
        assert assess_confidence(UDISE_2022, has_pass_rates=False, now=NOW) == Confidence.LOW

    def test_fresh_udise_without_pass_rates_caps_at_medium(self):
        """The rule requires both recency and pass rates for High. Enrolment
        counts alone don't describe quality no matter how fresh they are."""
        fresh = NOW - timedelta(days=200)
        assert assess_confidence(fresh, has_pass_rates=False, now=NOW) == Confidence.MEDIUM

    def test_fresh_with_pass_rates_can_reach_high(self):
        fresh = NOW - timedelta(days=200)
        assert assess_confidence(fresh, has_pass_rates=True, now=NOW) == Confidence.HIGH

    def test_stale_with_pass_rates_is_still_low(self):
        assert assess_confidence(UDISE_2022, has_pass_rates=True, now=NOW) == Confidence.LOW


class TestCoverageGuard:
    def test_indiranagar_case_is_blocked(self):
        """The measured failure: OSM had 61 schools within 2 km, UDISE had 0."""
        assert not coverage.coverage_is_publishable(within_2km=0, within_5km=1)
        reason = coverage.insufficient_coverage_reason(within_2km=0, within_5km=1)
        assert reason is not None and "implausibly low" in reason

    def test_zero_within_2km_blocks_even_with_many_at_5km(self):
        """Koramangala had 35 within 5 km but 0 within 2 km — the tight radius
        being empty in a dense neighbourhood is itself the defect signal."""
        assert not coverage.coverage_is_publishable(within_2km=0, within_5km=35)

    def test_healthy_gurugram_case_passes(self):
        assert coverage.coverage_is_publishable(within_2km=90, within_5km=200)

    def test_no_reason_when_coverage_is_fine(self):
        assert coverage.insufficient_coverage_reason(within_2km=13, within_5km=104) is None


class TestUdiseParsing:
    BASE = {
        "udise_school_code": "29010100101",
        "school_name": "GOVT HIGH SCHOOL TEST",
        "latitude": 12.97,
        "longitude": 77.59,
        "state_name": "Karnataka",
        "district_name": "Bengaluru U South",
        "status": "Functional",
    }

    def test_parses_a_good_row(self):
        parsed = _parse(dict(self.BASE), centre=(12.9716, 77.5946))
        assert parsed is not None
        assert parsed["udise_code"] == "29010100101"

    def test_null_island_is_rejected(self):
        """0,0 is the Gulf of Guinea and is what an unfilled coordinate looks like."""
        row = {**self.BASE, "latitude": 0, "longitude": 0}
        assert _parse(row, centre=(12.9716, 77.5946)) is None

    def test_far_away_coordinate_is_rejected(self):
        """UDISE files some schools under a Bengaluru district with coordinates
        400 km away in Dharwad."""
        row = {**self.BASE, "latitude": 15.36, "longitude": 75.12}
        assert _parse(row, centre=(12.9716, 77.5946)) is None

    def test_closed_schools_are_dropped(self):
        row = {**self.BASE, "status": "Closed"}
        assert _parse(row, centre=(12.9716, 77.5946)) is None

    def test_missing_code_is_dropped(self):
        row = {**self.BASE, "udise_school_code": ""}
        assert _parse(row, centre=(12.9716, 77.5946)) is None

    @pytest.mark.parametrize(
        "raw,expected",
        [
            ("GOVT HIGH SCHOOL", "Govt High School"),
            ("SRI VIDYA CBSE SCHOOL", "Sri Vidya CBSE School"),
        ],
    )
    def test_name_casing_keeps_acronyms(self, raw, expected):
        assert _titleish(raw) == expected
