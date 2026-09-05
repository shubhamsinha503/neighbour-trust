"""Scoring the categories whose only source is local press.

These exist to hold one line: press coverage measures media attention, not
incidence, so a score built on it must read the *mix* of what was reported and
never mainly the *volume*. Get that wrong and a well-covered neighbourhood is
ranked as more dangerous than an identical one nobody writes about — the
ranking inverts reality, which is worse than publishing no ranking at all.
"""

import pytest

from agents.orchestrator import press_score


def payload(**counts):
    return {"news": {"incident_type_counts": counts}}


class TestCoverageBias:
    """The property the whole approach depends on."""

    def test_more_coverage_of_the_same_mix_barely_moves_the_score(self):
        """Two localities with identical composition, one covered three times as
        heavily. If volume dominated, the well-covered one would be ranked far
        worse for being written about."""
        thin = press_score.score_crime(payload(assault=2, theft=6))
        heavy = press_score.score_crime(payload(assault=6, theft=18))
        assert abs(thin - heavy) <= 15, (thin, heavy)

    def test_composition_moves_the_score_a_lot(self):
        """The same number of incidents, different kinds. This is the signal that
        survives coverage bias, so it must be the one that counts."""
        violent = press_score.score_crime(payload(assault=8, murder=2))
        property_only = press_score.score_crime(payload(theft=8, snatching=2))
        assert property_only - violent >= 30, (property_only, violent)

    def test_volume_saturates(self):
        """Beyond a point, more reports are a fact about journalists."""
        many = press_score.score_crime(payload(assault=12, theft=12))
        far_more = press_score.score_crime(payload(assault=40, theft=40))
        assert many == far_more


class TestAbsenceIsNeverScored:
    """The half of the proposal that had to be refused.

    Giving an unreported locality a neutral or generous score rewards silence,
    and silence is exactly what a buyer can learn least from. Absence leaves the
    category unscored and the card says no coverage was found.
    """

    def test_no_incidents_gives_no_score(self):
        assert press_score.score_crime(payload()) is None
        assert press_score.score_water(payload()) is None
        assert press_score.score_power(payload()) is None

    def test_below_threshold_gives_no_score(self):
        """Two articles is not a mix; a share computed from them says more about
        chance than about the place."""
        assert press_score.score_crime(payload(theft=2)) is None
        assert press_score.score_water(payload(waterlogging=2)) is None

    def test_silence_never_outranks_a_clean_record(self):
        """An unreported locality must not be able to beat one with reported,
        non-violent incidents. It scores nothing at all instead."""
        assert press_score.score_crime(payload()) is None
        assert press_score.score_crime(payload(theft=5)) is not None


class TestCrime:
    def test_violence_costs_more_than_property_crime(self):
        assert press_score.score_crime(payload(assault=5, theft=5)) < press_score.score_crime(
            payload(theft=10)
        )

    def test_excluded_types_do_not_affect_the_score(self):
        """Self-harm and policing complaints are excluded from safety cards, so
        they must not move the number either."""
        clean = press_score.score_crime(payload(theft=6))
        with_excluded = press_score.score_crime(payload(theft=6, suicide=10, illegal_arrest=8))
        assert clean == with_excluded


class TestWater:
    def test_contamination_is_the_heaviest_single_finding(self):
        """No official source covers water quality at locality level at all."""
        contaminated = press_score.score_water(payload(contamination=4))
        supply = press_score.score_water(payload(water_shortage=4))
        assert contaminated < supply

    def test_recurrent_flooding_costs_more_than_one_report(self):
        assert press_score.score_water(payload(waterlogging=5)) < press_score.score_water(
            payload(waterlogging=1, water_shortage=2)
        )


class TestPower:
    def test_equipment_failure_costs_more_than_scheduled_work(self):
        """Scoring them alike would penalise a utility for announcing its
        maintenance, which is the opposite of what a buyer should be told."""
        assert press_score.score_power(payload(transformer_failure=4)) < press_score.score_power(
            payload(scheduled_maintenance=4)
        )

    def test_scheduled_maintenance_stays_high(self):
        assert press_score.score_power(payload(scheduled_maintenance=5)) >= 90


class TestRange:
    @pytest.mark.parametrize(
        "counts",
        [
            {"assault": 50, "murder": 30},
            {"contamination": 40, "waterlogging": 40, "water_shortage": 40},
            {"transformer_failure": 60},
        ],
    )
    def test_scores_stay_within_bounds(self, counts):
        """Even a worst case stays a score rather than becoming a zero, because
        press coverage cannot support a claim that strong."""
        for category in ("crime", "water", "power"):
            value = press_score.score(category, payload(**counts))
            if value is not None:
                assert 5 <= value <= 100
