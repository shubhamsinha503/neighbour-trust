"""Tests for the CPCB AQI computation.

This is the one piece of the pipeline where being quietly wrong produces a
plausible-looking number rather than an error, so it gets real coverage —
including CPCB's own published worked example as the anchor.
"""

from datetime import timedelta

import pytest

from agents.air_quality.aqi import band_for, compute_aqi, sub_index
from agents.air_quality.agent import assess_confidence
from neighbour_trust_schema.envelope import AqiBand, Confidence


class TestSubIndex:
    def test_cpcb_worked_example(self):
        """CPCB's About_AQI document: PM2.5 of 45 µg/m³ is a sub-index of 75.

        This is the case that pins the band bounds to 31-60 rather than 30-60.
        Sharing edges gives 75.5 and rounds the wrong way.
        """
        assert sub_index("pm2_5", 45) == pytest.approx(75, abs=0.5)

    def test_cpcb_band_anchors(self):
        assert sub_index("pm2_5", 31) == pytest.approx(51, abs=0.1)
        assert sub_index("pm2_5", 60) == pytest.approx(100, abs=0.1)
        assert sub_index("pm2_5", 30) == pytest.approx(50, abs=0.1)

    def test_pm10_anchors(self):
        assert sub_index("pm10", 100) == pytest.approx(100, abs=0.1)
        assert sub_index("pm10", 250) == pytest.approx(200, abs=0.1)

    def test_co_is_indexed_in_mg_per_m3(self):
        # 1.5 mg/m³ sits mid-way through the 51-100 band.
        assert 51 <= sub_index("co", 1.5) <= 100
        # The same figure read as µg/m³ would be a wildly different band, which is
        # why the OpenAQ client converts before it gets here.
        assert sub_index("co", 1500) == 500.0

    def test_above_scale_clamps_to_500(self):
        assert sub_index("pm2_5", 10_000) == 500.0

    def test_negative_reading_is_rejected(self):
        """Faulted sensors report negatives; treating them as zero would improve
        the AQI rather than drop the pollutant."""
        assert sub_index("pm2_5", -5) is None

    def test_unknown_pollutant(self):
        assert sub_index("benzene", 10) is None

    def test_dead_zone_between_bands_does_not_dip(self):
        """30.5 µg/m³ is above the 0-30 band and below the 31-60 one."""
        assert sub_index("pm2_5", 30.5) >= 50


class TestBands:
    @pytest.mark.parametrize(
        "aqi,expected",
        [
            (0, AqiBand.GOOD), (50, AqiBand.GOOD),
            (51, AqiBand.SATISFACTORY), (100, AqiBand.SATISFACTORY),
            (101, AqiBand.MODERATE), (200, AqiBand.MODERATE),
            (201, AqiBand.POOR), (300, AqiBand.POOR),
            (301, AqiBand.VERY_POOR), (400, AqiBand.VERY_POOR),
            (401, AqiBand.SEVERE), (500, AqiBand.SEVERE),
        ],
    )
    def test_band_boundaries(self, aqi, expected):
        assert band_for(aqi) == expected


class TestComputeAqi:
    def test_aqi_is_the_max_sub_index_not_the_mean(self):
        result = compute_aqi({"pm2_5": 45, "pm10": 300, "no2": 20})
        assert result is not None
        assert result.dominant_pollutant == "pm10"
        # pm10 300 sits in the 251-350 -> 201-300 band; the mean of the three
        # sub-indices would be roughly half this.
        assert result.aqi > 200

    def test_requires_three_pollutants(self):
        assert compute_aqi({"pm2_5": 45, "pm10": 80}) is None

    def test_requires_a_particulate(self):
        """Three trace gases without PM2.5 or PM10 is not a CPCB AQI."""
        assert compute_aqi({"no2": 50, "so2": 60, "co": 1.5}) is None

    def test_particulate_plus_two_gases_is_enough(self):
        assert compute_aqi({"pm2_5": 45, "no2": 50, "so2": 60}) is not None

    def test_none_values_are_skipped(self):
        assert compute_aqi({"pm2_5": 45, "pm10": None, "no2": 20, "so2": 30}) is not None

    def test_gurugram_live_shape(self):
        """A reading of the shape seen live at Vikas Sadan, Gurugram."""
        result = compute_aqi({"pm2_5": 140.5, "pm10": 180.0, "no2": 14.6, "so2": 53.9})
        assert result is not None
        assert result.dominant_pollutant == "pm2_5"
        assert result.band == AqiBand.VERY_POOR


class TestConfidence:
    def test_close_and_fresh_is_high(self):
        assert assess_confidence(2.0, timedelta(hours=1)) == Confidence.HIGH

    def test_distance_alone_degrades(self):
        assert assess_confidence(9.0, timedelta(hours=1)) == Confidence.MEDIUM
        assert assess_confidence(20.0, timedelta(hours=1)) == Confidence.LOW

    def test_staleness_caps_a_close_station(self):
        """The AQICN failure mode: a well-sited station serving old readings.
        Distance alone would have called this High."""
        assert assess_confidence(1.0, timedelta(hours=6)) == Confidence.MEDIUM
        assert assess_confidence(1.0, timedelta(hours=30)) == Confidence.LOW

    def test_very_stale_is_unusable(self):
        """Eight-week-old Bengaluru readings must not be published as current."""
        assert assess_confidence(1.0, timedelta(days=56)) is None
