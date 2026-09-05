"""Scoring what is built around a locality.

This card shows what already exists, not RERA registrations or upcoming
projects — docs/strategy.md scopes the category to the latter, and that remains
a scraping-or-partnership problem. The card and its label say which of the two
it is showing, because quietly redefining a category is how a product stops
meaning what it says.
"""

import pytest

from agents.infrastructure.agent import MIN_FEATURES_FOR_DATA, describe, score_amenities
from agents.infrastructure.sources.osm_amenities import Amenities


def area(**kw):
    return Amenities(**kw)


class TestTransitLeads:
    """People move for the commute more than for anything else here."""

    def test_a_close_station_beats_a_distant_one(self):
        near = area(metro_rail=1, nearest_metro_km=0.6, hospitals=5,
                    nearest_hospital_km=1.0, parks=10, markets=5)
        far = area(metro_rail=1, nearest_metro_km=2.9, hospitals=5,
                   nearest_hospital_km=1.0, parks=10, markets=5)
        assert score_amenities(near) - score_amenities(far) >= 20

    def test_no_station_at_all_is_a_real_penalty(self):
        with_metro = area(metro_rail=1, nearest_metro_km=1.0, hospitals=4,
                          nearest_hospital_km=1.0, parks=8, markets=4)
        without = area(hospitals=4, nearest_hospital_km=1.0, parks=8, markets=4)
        assert score_amenities(with_metro) > score_amenities(without)


class TestIndustryCountsAgainst:
    """The one signal here a buyer wants far away rather than near.

    No Indian source publishes the distance between industrial land and housing,
    which is exactly why it belongs on this card.
    """

    def test_industrial_land_next_door_lowers_the_score(self):
        clean = area(metro_rail=1, nearest_metro_km=1.0, hospitals=6,
                     nearest_hospital_km=0.8, parks=10, markets=5)
        beside_industry = area(metro_rail=1, nearest_metro_km=1.0, hospitals=6,
                               nearest_hospital_km=0.8, parks=10, markets=5,
                               industrial_sites=12, nearest_industry_km=0.5)
        assert score_amenities(clean) - score_amenities(beside_industry) >= 12

    def test_distant_industry_is_not_penalised(self):
        near = area(metro_rail=1, nearest_metro_km=1.0, parks=8,
                    industrial_sites=5, nearest_industry_km=0.4)
        far = area(metro_rail=1, nearest_metro_km=1.0, parks=8,
                   industrial_sites=5, nearest_industry_km=4.0)
        assert score_amenities(far) > score_amenities(near)


class TestMapDensityDoesNotBuyPoints:
    """Counts saturate fast.

    The difference between zero hospitals and two is real; between two and
    thirty it is mostly a difference in how densely a district was mapped, and
    rewarding that would score the map rather than the place.
    """

    def test_counts_saturate(self):
        some = area(metro_rail=1, nearest_metro_km=1.0, hospitals=6, clinics=6,
                    nearest_hospital_km=0.5, parks=12, markets=8)
        far_more = area(metro_rail=1, nearest_metro_km=1.0, hospitals=60, clinics=60,
                        nearest_hospital_km=0.5, parks=120, markets=80)
        assert score_amenities(some) == score_amenities(far_more)


class TestRange:
    @pytest.mark.parametrize("amenities", [
        area(),
        area(metro_rail=1, nearest_metro_km=0.1, hospitals=99, clinics=99,
             nearest_hospital_km=0.1, parks=99, markets=99),
        area(industrial_sites=99, nearest_industry_km=0.05),
    ])
    def test_stays_within_bounds(self, amenities):
        assert 5 <= score_amenities(amenities) <= 100


class TestDescription:
    def test_leads_with_the_station(self):
        line = describe(area(metro_rail=1, nearest_metro_km=0.68,
                             names={"metro_rail": ["Yelahanka"]},
                             hospitals=3, nearest_hospital_km=0.4, parks=9))
        assert line.startswith("nearest station 0.68 km")
        assert "Yelahanka" in line

    def test_says_plainly_when_there_is_no_station(self):
        """An absence a buyer needs stated, not left to be inferred from a gap."""
        line = describe(area(hospitals=2, nearest_hospital_km=1.1))
        assert "no rail or metro station" in line

    def test_close_industry_is_mentioned(self):
        line = describe(area(metro_rail=1, nearest_metro_km=1.0,
                             industrial_sites=8, nearest_industry_km=0.6))
        assert "industrial land" in line


class TestUnmappedIsNotEmpty:
    """The guard that keeps this honest.

    Manesar returned zero industrial sites on the first real run — for a
    locality beside one of India's largest industrial estates — because
    OpenStreetMap coverage in outer Gurugram is thin. Scoring that as "nothing
    nearby" would hand the best score to the worst-mapped area.
    """

    def test_threshold_exists_and_is_above_zero(self):
        assert MIN_FEATURES_FOR_DATA > 0

    def test_the_agent_checks_the_total_before_scoring(self):
        import pathlib

        source = pathlib.Path("agents/infrastructure/agent.py").read_text(encoding="utf-8")
        assert "MIN_FEATURES_FOR_DATA" in source
        # The check must precede scoring, or it is decoration.
        assert source.index("MIN_FEATURES_FOR_DATA:") < source.index("score_amenities(found)")
