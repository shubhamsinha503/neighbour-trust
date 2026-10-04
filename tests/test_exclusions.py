"""Tests for the verified-exclusion list.

Most of these assert what the filter must NOT do. It exists because a locality
was credited with murders that happened elsewhere, and the obvious general fix
for that — guessing from capitalisation whether a name is a person — was
measured against 343 real headlines and found to throw out genuine incidents.
Suppressing a real incident from a safety page is the same failure as inventing
one, so the filter is deliberately narrow and these tests hold it there.
"""

from agents.news_monitor.exclusions import (
    VERIFIED_EXCLUSIONS,
    city_mismatch_reason,
    exclusion_reason,
    filter_incidents,
    has_local_evidence,
)


class TestTheCaseItExistsFor:
    def test_person_named_after_the_town_is_excluded(self):
        assert exclusion_reason(
            "Cow vigilante Monu Manesar alleges death threat from gang", "Manesar"
        )

    def test_match_is_case_insensitive(self):
        assert exclusion_reason(
            "Rajasthan HC grants bail to MONU MANESAR in Bhiwani double murder",
            "Manesar",
        )

    def test_only_applies_to_its_own_locality(self):
        """The list is keyed by locality. A phrase about Manesar must not filter
        anything on another locality's page."""
        assert exclusion_reason("Monu Manesar granted bail", "Whitefield") is None


class TestRealIncidentsSurvive:
    """Every one of these was wrongly dropped by an earlier general heuristic."""

    def test_possessive_city_prefix_is_not_a_name(self):
        assert (
            exclusion_reason(
                "Man arrested for molesting woman in Bengaluru's Koramangala",
                "Koramangala",
            )
            is None
        )

    def test_quantifier_before_locality_is_not_a_name(self):
        assert (
            exclusion_reason(
                "Three Whitefield family members shot by other family member",
                "Whitefield",
            )
            is None
        )

    def test_incidental_institution_mention_is_not_grounds(self):
        """A real killing in Manesar, thrown out by an earlier version because
        the victim happened to be an ex-NSG commando."""
        assert (
            exclusion_reason(
                "Bullets rain in Manesar: revenge killing caught on CCTV; "
                "murder convict, ex-NSG commando killed",
                "Manesar",
            )
            is None
        )

    def test_title_case_verb_is_not_a_name(self):
        assert (
            exclusion_reason(
                "Karnataka HC Warns Whitefield Police Against Interfering",
                "Whitefield",
            )
            is None
        )

    def test_plain_local_incident_survives(self):
        assert (
            exclusion_reason("Woman strangled by husband after argument in Manesar",
                             "Manesar")
            is None
        )


class TestFilter:
    def test_returns_what_it_dropped_and_why(self):
        """A silent filter is how you end up unable to explain your own numbers."""
        incidents = [
            {"title": "Monu Manesar granted bail by Rajasthan HC"},
            {"title": "Woman strangled by husband in Manesar"},
        ]
        kept, dropped = filter_incidents(incidents, locality="Manesar")
        assert len(kept) == 1
        assert len(dropped) == 1
        title, reason = dropped[0]
        assert "Monu" in title and reason

    def test_missing_title_does_not_crash(self):
        kept, dropped = filter_incidents([{"title": None}], locality="Manesar")
        assert len(kept) == 1

    def test_every_entry_carries_a_reason(self):
        """The list is hand-maintained; an entry with no stated reason is an
        entry nobody can audit later."""
        for locality, phrase, why in VERIFIED_EXCLUSIONS:
            assert locality and phrase and why
            assert phrase == phrase.lower(), "phrases are matched lowercased"


class TestCrossCityUrlGuard:
    """The original guard: drop coverage whose URL is filed under another city."""

    def test_foreign_city_section_is_dropped(self):
        assert city_mismatch_reason(
            "https://www.thehindu.com/news/cities/chennai/anna-nagar-swd/", "Hyderabad"
        )

    def test_own_city_section_is_kept(self):
        assert (
            city_mismatch_reason(
                "https://timesofindia.com/city/hyderabad/anna-nagar-story", "Hyderabad"
            )
            is None
        )

    def test_no_city_in_url_is_not_judged_here(self):
        """A bare slug tells this guard nothing — the strict filter handles it."""
        assert city_mismatch_reason("https://example.com/anna-nagar-swd", "Hyderabad") is None


class TestPositiveEvidence:
    def test_url_in_own_city_section_counts(self):
        assert has_local_evidence(
            "https://timesofindia.com/city/hyderabad/x", "", "Hyderabad", "Telangana"
        )

    def test_city_named_in_headline_counts(self):
        assert has_local_evidence(
            "", "Anna Nagar in Hyderabad floods after rain", "Hyderabad", "Telangana"
        )

    def test_state_named_in_headline_counts(self):
        assert has_local_evidence(
            "", "Telangana rains hit Anna Nagar", "Hyderabad", "Telangana"
        )

    def test_nothing_tying_it_to_our_city_is_no_evidence(self):
        assert not has_local_evidence(
            "https://example.com/anna-nagar-swd-works",
            "Anna Nagar Second Avenue SWD works drag on for nine months",
            "Hyderabad",
            "Telangana",
        )


class TestStrictFilterForAmbiguousNames:
    """The Anna Nagar case: the Hyderabad locality must not inherit Chennai news."""

    chennai_story = {
        "title": "Anna Nagar Second Avenue SWD works drag on for nine months",
        "url": "https://example.com/anna-nagar-swd-works",
    }
    hyderabad_story = {
        "title": "Theft reported in Hyderabad's Anna Nagar, two held",
        "url": "https://example.com/story",
    }

    def test_strict_drops_story_with_no_local_evidence(self):
        kept, dropped = filter_incidents(
            [self.chennai_story],
            locality="Anna Nagar",
            city="Hyderabad",
            state="Telangana",
            strict=True,
        )
        assert kept == []
        assert len(dropped) == 1 and "more than one city" in dropped[0][1]

    def test_strict_keeps_story_that_names_our_city(self):
        kept, dropped = filter_incidents(
            [self.hyderabad_story],
            locality="Anna Nagar",
            city="Hyderabad",
            state="Telangana",
            strict=True,
        )
        assert len(kept) == 1 and dropped == []

    def test_non_strict_keeps_everything_for_unique_names(self):
        """A unique name (Koramangala) never pays the recall cost of strictness."""
        kept, dropped = filter_incidents(
            [self.chennai_story],
            locality="Koramangala",
            city="Bengaluru",
            state="Karnataka",
            strict=False,
        )
        assert len(kept) == 1 and dropped == []

    def test_strict_still_defers_to_the_url_city_guard(self):
        """A URL filed under a foreign city is dropped by the existing guard."""
        story = {
            "title": "Anna Nagar news",
            "url": "https://www.thehindu.com/news/cities/chennai/anna-nagar",
        }
        kept, dropped = filter_incidents(
            [story], locality="Anna Nagar", city="Hyderabad", state="Telangana", strict=True
        )
        assert kept == []
        assert "chennai" in dropped[0][1].lower()
