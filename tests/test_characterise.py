"""Tests for incident characterisation.

This code puts sentences about crime on a page someone reads before spending
crores, so the tests pin the claims it must never make: no pattern from a single
article, no silent dropping of violent incidents, no describing a place as
property-crime-only when violence was reported.
"""

from datetime import datetime, timezone

from agents.news_monitor.characterise import (
    MIN_FOR_PATTERN,
    characterise,
    characterise_crime,
    characterise_water,
)


def incident(incident_type: str, month: int = 7) -> dict:
    return {
        "incident_type": incident_type,
        "published_at": datetime(2026, month, 15, tzinfo=timezone.utc),
    }


class TestCrime:
    def test_too_few_gives_no_characterisation(self):
        """Two thefts is an anecdote. Describing it as 'mostly property crime'
        would dress a couple of articles as a trend."""
        assert characterise_crime([incident("theft"), incident("theft")]) is None

    def test_property_only_says_so_explicitly(self):
        result = characterise_crime([incident("theft")] * 3 + [incident("snatching")])
        assert result is not None
        assert "property crime" in result
        assert "Nothing involving violence" in result

    def test_violence_is_never_omitted(self):
        """The failure that would matter most: reporting a place as property-crime
        only when an assault was among the incidents."""
        result = characterise_crime([incident("theft")] * 5 + [incident("assault")])
        assert result is not None
        assert "violence" in result.lower()

    def test_violent_majority_is_led_with(self):
        result = characterise_crime([incident("assault")] * 4 + [incident("theft")])
        assert result is not None
        assert "involve violence" in result

    def test_unknown_types_do_not_crash_or_vanish(self):
        """The classifier is not constrained to a fixed vocabulary."""
        result = characterise_crime(
            [incident("cybercrime"), incident("trespass"), incident("nuisance")]
        )
        assert result is not None

    def test_none_incident_type_is_tolerated(self):
        result = characterise_crime([{"incident_type": None}] * 4)
        assert result is not None


class TestWater:
    def test_too_few_gives_nothing(self):
        assert characterise_water([incident("waterlogging")]) is None

    def test_monsoon_waterlogging_is_called_out(self):
        result = characterise_water([incident("waterlogging", month=m) for m in (6, 7, 8)])
        assert result is not None
        assert "monsoon" in result
        assert "3 times" in result

    def test_waterlogging_outside_monsoon_is_distinguished(self):
        """Flooding in January says something different about drainage than
        flooding in July."""
        result = characterise_water(
            [incident("waterlogging", month=7), incident("waterlogging", month=1),
             incident("waterlogging", month=2)]
        )
        assert result is not None
        assert "outside the monsoon" in result

    def test_supply_and_quality_are_separated(self):
        result = characterise_water(
            [incident("water_shortage"), incident("tanker_dependence"), incident("contamination")]
        )
        assert result is not None
        assert "supply" in result.lower()
        assert "contamination" in result.lower() or "sewage" in result.lower()

    def test_sentence_is_capitalised(self):
        result = characterise_water([incident("waterlogging")] * 3)
        assert result and result[0].isupper() and result.endswith(".")


class TestDispatch:
    def test_unknown_category_returns_none(self):
        assert characterise("power", [incident("outage")] * 5) is None

    def test_threshold_is_shared(self):
        assert MIN_FOR_PATTERN >= 3
