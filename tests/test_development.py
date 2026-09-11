"""Infrastructure the local press reports as coming.

docs/strategy.md scopes this category to RERA registrations and state master
plans — what is approved, and by whom. That remains a scraping-or-partnership
problem: no state RERA portal has an API and the plans are PDFs. This is the
checkable half. Not what was approved, but what was reported.

Three properties make the difference between it being useful and it being a
builder's brochure, and each is pinned here.
"""

import pytest

from agents.news_monitor import agent as news_agent
from agents.news_monitor import classify as classify_mod
from agents.orchestrator import agent as orchestrator
from agents.orchestrator import score as score_mod


class TestAnnouncementsAreTheSignalHere:
    """Everywhere else in this pipeline an announcement means city-level
    coverage — the strongest single indicator of a non-incident. For
    development it is the thing being looked for, so the rule inverts."""

    def test_a_project_approval_is_confirmed(self):
        judged = classify_mod.HeuristicClassifier().classify(
            title="Namma Metro line approved for Hebbal",
            locality="Hebbal", city="Bengaluru", category="development",
        )
        assert judged is not None and judged.is_locality_specific
        assert judged.incident_type == "metro"

    def test_the_same_words_still_disqualify_a_crime_headline(self):
        """The inversion must be local to development. If POLICY_MARKERS
        stopped rejecting announcements for crime, a state budget speech
        naming a locality would become a safety incident."""
        judged = classify_mod.HeuristicClassifier().classify(
            title="Minister announces new policing scheme for Hebbal",
            locality="Hebbal", city="Bengaluru", category="crime",
        )
        assert judged is not None and judged.is_locality_specific is False

    def test_an_incident_is_not_a_project(self):
        judged = classify_mod.HeuristicClassifier().classify(
            title="Theft reported in Hebbal", locality="Hebbal",
            city="Bengaluru", category="development",
        )
        assert judged is not None and judged.is_locality_specific is False

    def test_development_has_its_own_instructions(self):
        assert (
            classify_mod.system_prompt_for("development")
            is classify_mod.DEVELOPMENT_SYSTEM_PROMPT
        )
        assert classify_mod.system_prompt_for("water") is classify_mod.SYSTEM_PROMPT


class TestItIsNeverAScore:
    """Press attention tracks media-market size. Counting what is coming would
    tell a buyer that a well-covered neighbourhood has more planned than an
    identical one nobody writes about — the exact distortion the volume rules
    prevent for crime, water and power."""

    def test_not_scoreable(self):
        assert "development" not in score_mod.SCOREABLE

    def test_carries_no_weight(self):
        assert "development" not in score_mod.CATEGORY_WEIGHTS

    def test_is_not_a_card_on_the_grid(self):
        """Reading it as a sixth category would invite the comparison it cannot
        support. It is shown below them, as findings rather than a figure."""
        assert "development" not in orchestrator.REPORT_CATEGORIES

    def test_but_it_is_still_fetched(self):
        assert "development" in news_agent.CATEGORIES


class TestHeadlinesRatherThanASummary:
    def test_items_carry_the_headline_verbatim(self):
        """Two of Hebbal's confirmed items are about a metro proposal being
        delayed. Any sentence generated from them — "metro line planned" —
        would turn a stalled proposal into a promise."""
        envelopes = {
            "development": {
                "payload": {
                    "news": {
                        "recent": [
                            {
                                "title": "Hebbal Tunnel project: High Court warns of stay",
                                "incident_type": "legal_dispute",
                                "published_at": "2026-08-06T07:00:00Z",
                                "url": "https://example.test/a",
                                "source_name": "The Indian Express",
                            }
                        ]
                    }
                }
            }
        }
        items = orchestrator._upcoming(envelopes)
        assert len(items) == 1
        assert items[0]["headline"] == "Hebbal Tunnel project: High Court warns of stay"
        assert items[0]["kind"] == "legal_dispute"

    def test_an_unjudged_mention_is_not_shown(self):
        """Absence of a verdict is not a finding. An unclassified headline is
        excluded everywhere else here and must be excluded from this too."""
        envelopes = {
            "development": {
                "payload": {"news": {"recent": [
                    {"title": "Something about Hebbal", "incident_type": None},
                ]}}
            }
        }
        assert orchestrator._upcoming(envelopes) == []

    def test_no_development_data_yields_nothing(self):
        """Silence is not a finding: a locality nobody writes about is not a
        locality with nothing planned."""
        assert orchestrator._upcoming({}) == []
        assert orchestrator._upcoming({"development": {}}) == []

    def test_the_list_is_bounded(self):
        many = {
            "development": {
                "payload": {"news": {"recent": [
                    {"title": f"Project {i}", "incident_type": "metro"}
                    for i in range(20)
                ]}}
            }
        }
        assert len(orchestrator._upcoming(many)) <= 5
