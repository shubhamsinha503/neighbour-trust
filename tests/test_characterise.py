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
        """Categories with no source produce no sentence. This asserted on
        "power" until power gained a news feed, at which point it was asserting
        the opposite of the intended behaviour."""
        assert characterise("infrastructure", [incident("metro")] * 5) is None
        assert characterise("schools", [incident("anything")] * 5) is None

    def test_the_three_news_categories_are_all_handled(self):
        found = [
            c for c in ("crime", "water", "power")
            if characterise(c, [incident("theft" if c == "crime" else
                                        "waterlogging" if c == "water" else
                                        "power_outage")] * 4)
        ]
        assert found == ["crime", "water", "power"]

    def test_threshold_is_shared(self):
        assert MIN_FOR_PATTERN >= 3


class TestSourceAttribution:
    """The envelope must credit the source that actually fetched the articles.

    This shipped wrong: the news envelope named GDELT as its source
    unconditionally, while every article in the database had come from Google
    News — a source that had been unreachable for days. On a product whose
    stated differentiator is showing where its data came from, crediting the
    wrong source is not a cosmetic bug.
    """

    def test_credits_the_source_that_fetched(self):
        from agents.news_monitor.agent import attribution

        name, url = attribution(["Google News"])
        assert name == "Google News"
        assert url == "https://news.google.com/"

    def test_does_not_credit_a_source_that_contributed_nothing(self):
        from agents.news_monitor.agent import attribution

        name, _ = attribution(["Google News"])
        assert "GDELT" not in name

    def test_names_every_contributing_source(self):
        from agents.news_monitor.agent import attribution

        name, _ = attribution(["Google News", "GDELT"])
        assert "Google News" in name and "GDELT" in name

    def test_no_link_when_sources_disagree_on_one(self):
        """A single source_url cannot honestly stand for two different sources."""
        from agents.news_monitor.agent import attribution

        _, url = attribution(["Google News", "GDELT"])
        assert url is None

    def test_ordering_is_stable(self):
        from agents.news_monitor.agent import attribution

        assert attribution(["GDELT", "Google News"])[0] == attribution(
            ["Google News", "GDELT"]
        )[0]


class TestPower:
    """Power is the category with no official source at all.

    NCRB is late and district-level; UDISE is stale but real. For outages no
    Indian body publishes anything at locality level, so press coverage is not a
    supplement here — it is the entire record until residents report.
    """

    def test_too_few_gives_nothing(self):
        from agents.news_monitor.characterise import characterise_power

        assert characterise_power([incident("power_outage")] * 2) is None

    def test_equipment_failure_beats_the_generic_outage_label(self):
        """"transformer_failure" contains "failure", which also appears in the
        unplanned vocabulary. With the general test running first every
        equipment fault was counted as a generic outage and the repeated-fault
        case could never be reported."""
        from agents.news_monitor.characterise import characterise_power

        result = characterise_power(
            [incident("transformer_failure")] * 3 + [incident("power_outage")] * 2
        )
        assert result and "Equipment failures" in result

    def test_unplanned_is_distinguished_from_scheduled(self):
        from agents.news_monitor.characterise import characterise_power

        result = characterise_power(
            [incident("power_outage")] * 4 + [incident("scheduled_maintenance")]
        )
        assert result and "unplanned" in result

    def test_scheduled_maintenance_is_not_called_an_outage_problem(self):
        """A maintenance calendar is an inconvenience you can plan around, and
        reporting it as unreliability would overstate what the press said."""
        from agents.news_monitor.characterise import characterise_power

        result = characterise_power([incident("scheduled_maintenance")] * 4)
        assert result and "scheduled maintenance" in result

    def test_no_rate_is_ever_claimed(self):
        """Counting articles measures what was written about, not what happened.
        Nothing here may read as hours-per-week or a reliability percentage."""
        from agents.news_monitor.characterise import characterise_power

        for types in (["power_outage"] * 5, ["transformer_failure"] * 5):
            result = characterise_power([incident(t) for t in types])
            assert result
            assert "%" not in result
            assert "per week" not in result and "per month" not in result


class TestPowerIsNeverScored:
    def test_power_stays_out_of_the_composite(self):
        """Same reason crime and water are excluded: press coverage tracks media
        attention, and a well-covered locality would look less reliable than an
        identical one nobody writes about."""
        from agents.orchestrator.score import SCOREABLE, category_score

        assert "power" not in SCOREABLE
        assert category_score("power", {"news": {"incidents_12m": 9}}) is None
