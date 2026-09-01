"""Rules for the --reclassify lever.

Written after it caused an outage. A news_monitor run was started with
--reclassify while the Anthropic account had no quota left; the flag cleared
3,031 stored verdicts, classified none of them, and took every safety and water
count on the site to zero.

Two separate mistakes made that possible, and both are covered here: the clear
destroyed data it could not yet replace, and it ran before anything had checked
that a replacement was obtainable.
"""

import re
from pathlib import Path

import pytest

DB_SOURCE = Path("agents/common/db.py").read_text(encoding="utf-8")
RUN_SOURCE = Path("agents/news_monitor/run.py").read_text(encoding="utf-8")


def _clear_function() -> str:
    start = DB_SOURCE.index("def clear_classifications")
    rest = DB_SOURCE[start + 10 :]
    end = rest.find("\ndef ")
    return DB_SOURCE[start : start + 10 + (end if end != -1 else len(rest))]


class TestClearIsNotDestructive:
    def test_verdict_column_is_never_nulled(self):
        """`is_locality_specific` is what confirmed_incidents counts on. Nulling
        it empties every safety and water card until a re-judgement succeeds —
        and a re-judgement is exactly what may not be affordable."""
        body = _clear_function()
        assert "is_locality_specific = NULL" not in body
        assert "is_locality_specific=NULL" not in body

    def test_it_clears_the_queue_column(self):
        """`classified_at` is what unclassified_mentions queues on, so clearing
        it is what actually schedules the re-judgement."""
        body = _clear_function()
        assert re.search(r"SET\s+classified_at\s*=\s*NULL", body)

    def test_incident_type_is_preserved(self):
        """It is the only record of what a judged mention was judged to be, and
        the migration that repaired the outage reconstructed verdicts from it."""
        body = _clear_function()
        assert "incident_type = NULL" not in body


class TestRefusesWithoutAWorkingClassifier:
    def test_run_probes_before_clearing(self):
        """The probe must precede the clear, or the check is decoration."""
        probe_at = RUN_SOURCE.index("Refusing to re-classify")
        clear_at = RUN_SOURCE.index("db.clear_classifications")
        assert probe_at < clear_at

    def test_heuristic_is_refused(self):
        assert "no Claude classifier available" in RUN_SOURCE

    def test_a_declining_classifier_is_refused(self):
        """An unanswered test headline means an exhausted quota or a bad key."""
        assert "could not answer a test" in RUN_SOURCE

    def test_refusal_states_nothing_changed(self):
        assert "Nothing was changed" in RUN_SOURCE


class TestRepairMigration:
    MIGRATION = Path("infra/migrations/006_repair_cleared_classifications.sql")

    def test_exists(self):
        assert self.MIGRATION.exists()

    def test_only_touches_rows_the_clear_could_have_produced(self):
        """A never-judged row has no classifier; a correctly-negative row holds
        false rather than null. Only the damaged combination matches, so the
        migration is a no-op on every re-run."""
        sql = self.MIGRATION.read_text(encoding="utf-8").lower()
        assert "classifier is not null" in sql
        assert "is_locality_specific is null" in sql

    def test_restores_classified_at_too(self):
        """Otherwise all 3,031 rows queue for re-judgement on the next run — the
        bill that could not be paid in the first place."""
        sql = self.MIGRATION.read_text(encoding="utf-8").lower()
        assert "classified_at" in sql.split("set", 1)[1].split("where", 1)[0]
