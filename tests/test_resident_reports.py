"""Resident reports — the only source without press coverage's bias.

Safety, water and power have no locality-level official record in India, so
press coverage stands in for all three. It measures how closely a neighbourhood
is written about rather than what happens there. A resident is the one source
free of that, and carries the opposite weakness: exact about where, entirely
unverified about who.

These tests pin the consequences of that asymmetry. The most important one is
that nothing a stranger types can reach a score on its own — if it could, the
first people to notice would be the ones selling property there.
"""

from datetime import datetime, timedelta, timezone

import pytest

from agents.orchestrator import reports as reports_mod

NOW = datetime(2026, 9, 6, 12, 0, tzinfo=timezone.utc)


def report(
    category: str = "water",
    basis: str = "witnessed",
    tie: str = "lives_here",
    days_ago: int = 10,
    incident_type: str | None = None,
) -> dict:
    return {
        "category": category,
        "basis": basis,
        "tie_to_area": tie,
        "submitted_at": NOW - timedelta(days=days_ago),
        "incident_type": incident_type,
    }


class TestCredibility:
    def test_a_first_hand_resident_outweighs_a_passing_reader(self):
        strong = reports_mod.credibility(
            report(basis="happened_to_me", tie="lives_here"), now=NOW)
        weak = reports_mod.credibility(
            report(basis="read_it", tie="visiting"), now=NOW)
        assert strong > weak

    def test_no_answer_is_ever_worth_nothing(self):
        """A weak report is still a report. Scoring any answer at zero would
        discard exactly the accounts hardest to come by — people who have moved
        away, or who noticed something while considering the area."""
        for basis in reports_mod.BASIS_WEIGHT:
            for tie in reports_mod.TIE_WEIGHT:
                assert reports_mod.credibility(
                    report(basis=basis, tie=tie), now=NOW) > 0

    def test_unstated_sits_between_the_extremes(self):
        """Someone who skipped an optional question is not thereby the least
        credible person; they are unknown, which is a middle."""
        best = reports_mod.BASIS_WEIGHT["happened_to_me"]
        worst = reports_mod.BASIS_WEIGHT["read_it"]
        assert worst < reports_mod.BASIS_WEIGHT["unstated"] < best

    def test_reports_age_but_never_to_nothing(self):
        recent = reports_mod.credibility(report(days_ago=5), now=NOW)
        old = reports_mod.credibility(report(days_ago=900), now=NOW)
        assert old < recent
        # A transformer that failed repeatedly two years ago still says
        # something about the infrastructure.
        assert old >= reports_mod.MIN_AGE_WEIGHT * 0.5

    def test_credibility_is_never_presented_as_a_probability(self):
        """It orders reports and gates a baseline. It is not calibrated, so it
        must not escape onto a card as a percentage."""
        assert 0 < reports_mod.credibility(report(), now=NOW) <= 1.0


class TestDisplacingTheBaseline:
    """The no-reports baseline of 80 means 'nothing was reported'. A report
    makes that false — but a single weak one is thin ground for replacing a
    locality's shown figure."""

    def test_one_strong_first_hand_report_is_enough(self):
        group = [report(basis="happened_to_me", tie="lives_here")]
        assert reports_mod.displaces_baseline(group, now=NOW) is True

    def test_one_weak_second_hand_report_is_not(self):
        group = [report(basis="read_it", tie="visiting")]
        assert reports_mod.displaces_baseline(group, now=NOW) is False

    def test_corroboration_is_worth_more_than_the_sum_of_its_parts(self):
        """Two people describing the same problem is a different claim from one
        person saying it twice. A pair of moderate accounts clears the bar that
        either alone does not."""
        one = [report(basis="second_hand", tie="lives_here")]
        two = one * 2
        assert reports_mod.displaces_baseline(one, now=NOW) is False
        assert reports_mod.displaces_baseline(two, now=NOW) is True
        assert reports_mod.weigh(two, now=NOW) > 2 * reports_mod.weigh(one, now=NOW)

    def test_hearsay_does_not_become_evidence_by_repetition(self):
        """The bar is set at one first-hand account from someone who lives
        there. Weak second-hand reports must not reach it by piling up, or the
        easiest way to move a neighbourhood's card is to submit the same rumour
        from a few different browsers."""
        weak = [report(basis="read_it", tie="visiting")] * 2
        assert reports_mod.displaces_baseline(weak, now=NOW) is False

    def test_the_bar_is_exactly_one_first_hand_resident(self):
        """Stated as a test because it is the definition the threshold encodes,
        and a future change to the weights should have to face it."""
        unit = reports_mod.credibility(
            report(basis="happened_to_me", tie="lives_here", days_ago=0), now=NOW)
        assert unit == pytest.approx(reports_mod.MIN_WEIGHT_TO_DISPLACE_BASELINE)

    def test_nothing_reported_stays_nothing_reported(self):
        assert reports_mod.displaces_baseline([], now=NOW) is False
        assert reports_mod.weigh([], now=NOW) == 0.0


class TestFlags:
    def test_one_flag_per_category_not_one_per_report(self):
        """Five people reporting waterlogging is one finding about the road,
        not five findings competing for attention."""
        flags = reports_mod.to_flags([report()] * 5, now=NOW)
        assert len(flags) == 1
        assert "5 residents" in flags[0]["headline"]

    def test_a_single_report_reads_as_one_person(self):
        flags = reports_mod.to_flags([report()], now=NOW)
        assert "1 resident has" in flags[0]["headline"]

    def test_separate_categories_stay_separate(self):
        flags = reports_mod.to_flags(
            [report(category="water"), report(category="power")], now=NOW)
        assert {f["category"] for f in flags} == {"water", "power"}

    def test_violence_is_serious_and_inconvenience_is_not(self):
        violent = reports_mod.to_flags(
            [report(category="crime", incident_type="assault")], now=NOW)
        routine = reports_mod.to_flags(
            [report(category="water", incident_type="waterlogging")], now=NOW)
        assert violent[0]["severity"] == "serious"
        assert routine[0]["severity"] == "notable"

    def test_every_flag_says_reports_are_not_scored(self):
        """The card must not let a reader infer that resident accounts moved
        the number, because they never do."""
        for flag in reports_mod.to_flags([report(), report(category="power")], now=NOW):
            assert "not counted" in flag["detail"]

    def test_no_flags_from_no_reports(self):
        assert reports_mod.to_flags([], now=NOW) == []


class TestTheDatabaseRefusesShortcuts:
    """Guards that live in the schema rather than in Python, because the ones
    that matter must hold no matter which code path writes."""

    SOURCE = __import__("pathlib").Path(
        "infra/migrations/007_resident_report.sql"
    ).read_text(encoding="utf-8")

    def test_a_report_starts_unreviewed(self):
        assert "state           report_state_t NOT NULL DEFAULT 'pending'" in self.SOURCE

    def test_accepted_requires_a_human_and_a_timestamp(self):
        """The single most important constraint in the table. Without it, any
        code path can promote a stranger's text into a neighbourhood's score."""
        assert "resident_report_reviewed_together" in self.SOURCE

    def test_the_insert_helper_cannot_set_state(self):
        """Keeping `state` out of the insert signature means no caller can skip
        review by accident, only deliberately."""
        import inspect

        from agents.common import db

        params = inspect.signature(db.insert_resident_report).parameters
        assert "state" not in params
        assert "reviewed_at" not in params

    def test_an_erased_email_must_actually_be_gone(self):
        assert "resident_report_contact_erased" in self.SOURCE

    def test_erasure_keeps_the_report(self):
        """Someone withdrawing their email should not also withdraw their
        account of a flooded road."""
        import inspect

        from agents.common import db

        body = inspect.getsource(db.forget_report_contact)
        assert "UPDATE resident_report" in body
        assert "DELETE" not in body.upper().replace("DELETED", "")

    def test_reads_only_ever_see_accepted_reports(self):
        import inspect

        from agents.common import db

        assert "state = 'accepted'" in inspect.getsource(db.accepted_reports)

    def test_reimporting_the_same_submission_is_idempotent(self):
        assert "resident_report_source_external_idx" in self.SOURCE
        assert "ON CONFLICT" in __import__("inspect").getsource(
            __import__("agents.common.db", fromlist=["db"]).insert_resident_report
        )
