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
    is_excluded,
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
        """The classifier is not constrained to a fixed vocabulary. Unrecognised
        types must still be described — but not miscalled property crime."""
        result = characterise_crime(
            [incident("cybercrime"), incident("trespass"), incident("nuisance")]
        )
        assert result is not None
        assert "property crime" not in result
        assert "cybercrime" in result

    def test_untyped_incidents_produce_no_claim(self):
        """With no type labels there is nothing true to say about the kind of
        crime, so the card falls back to the plain count rather than inventing
        a character for the place."""
        assert characterise_crime([{"incident_type": None}] * 4) is None

    def test_examples_come_from_the_bucket_the_sentence_claims(self):
        """Shipped broken once. Whitefield read "a notable share involve violence
        (6 of 33) — 7 illegal arrest, 2 police misconduct and 2 suicide": the
        claim was about violence and not one example was violent."""
        result = characterise_crime(
            [incident("assault")] * 4 + [incident("murder")] * 2 + [incident("theft")]
        )
        assert result is not None
        assert "assault" in result and "murder" in result
        assert "theft" not in result

    def test_property_sentence_illustrates_with_property_types(self):
        result = characterise_crime([incident("theft")] * 6 + [incident("assault")] * 2)
        assert result is not None
        head, _, tail = result.partition("with")
        assert "theft" in head          # the "mostly property" half
        assert "assault" in tail        # the violence half

    def test_self_harm_never_appears_on_a_safety_card(self):
        """Not a crime against residents, not a signal about the area, and
        reporting suicides by neighbourhood is what press guidelines on suicide
        reporting specifically caution against."""
        result = characterise_crime(
            [incident("suicide")] * 5 + [incident("theft")] * 4
        )
        assert result is not None
        assert "suicide" not in result.lower()

    def test_policing_complaints_are_excluded(self):
        """They describe an institution's conduct, not risk to a resident, and
        they cluster wherever a police station happens to be."""
        assert is_excluded("illegal arrest")
        assert is_excluded("police misconduct")
        assert is_excluded("custodial death")
        assert not is_excluded("assault")

    def test_excluded_items_are_not_in_the_denominator(self):
        """"6 of 33" counted excluded items in the total, understating how
        concentrated the real incidents were."""
        result = characterise_crime(
            [incident("assault")] * 4 + [incident("theft")] * 2 + [incident("suicide")] * 20
        )
        assert result is not None
        assert "of 6" in result
        assert "33" not in result and "26" not in result

    def test_excluded_only_yields_nothing(self):
        assert characterise_crime([incident("suicide")] * 8) is None


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
