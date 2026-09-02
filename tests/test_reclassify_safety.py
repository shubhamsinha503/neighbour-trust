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

    def test_refuses_when_only_the_heuristic_is_available(self):
        """build_classifier probes each tier, so a heuristic result means every
        language model is out of quota or misconfigured. Re-classifying then
        would clear the queue, judge nothing, and leave every card reading
        "0% assessed" — which is what happened before this check existed."""
        assert 'probe.name.startswith("heuristic")' in RUN_SOURCE

    def test_refusal_names_both_keys_and_mentions_quota(self):
        """A missing key and a spent balance look identical from outside the
        process, and the fix for each is different."""
        assert "ANTHROPIC_API_KEY or GROQ_API_KEY" in RUN_SOURCE
        assert "no credit left" in RUN_SOURCE

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


class TestClassifierFallbackOrder:
    """Claude, then Groq, then the heuristic.

    The classifier is the only per-item cost in this system, and exhausting it
    stops the news pipeline dead — it did, leaving 802 headlines unjudged and
    every safety card reading "0% assessed". A free second tier turns a spent
    budget into slower work rather than halted work.
    """

    SOURCE = __import__("pathlib").Path(
        "agents/news_monitor/classify.py"
    ).read_text(encoding="utf-8")

    def test_groq_is_tried_before_the_heuristic(self):
        build = self.SOURCE[self.SOURCE.index("def build_classifier") :]
        assert build.index("GROQ_API_KEY") < build.index("HeuristicClassifier()")

    def test_claude_is_tried_before_groq(self):
        build = self.SOURCE[self.SOURCE.index("def build_classifier") :]
        assert build.index("ANTHROPIC_API_KEY") < build.index("GROQ_API_KEY")

    def test_both_models_share_one_system_prompt(self):
        """The prompt encodes judgements about the task, not about a model —
        that "Monu Manesar" names a man, that a labour dispute at an industrial
        estate is not a neighbourhood incident. A lesson learned from one
        classifier's mistake should improve both."""
        groq = self.SOURCE[self.SOURCE.index("class GroqClassifier") :]
        assert "SYSTEM_PROMPT" in groq[: groq.index("def _clean_type")]

    def test_verdicts_record_which_model_made_them(self):
        """So a mixed corpus stays auditable and --reclassify-from can revisit
        one classifier's work without paying to redo the other's."""
        assert 'self.name = f"groq:{self._model}"' in self.SOURCE

    def test_an_unparseable_answer_declines_rather_than_guesses(self):
        groq = self.SOURCE[self.SOURCE.index("class GroqClassifier") :]
        body = groq[: groq.index("def _clean_type")]
        assert "JSONDecodeError" in body
        # The verdict goes through _as_bool, which accepts a boolean or the
        # exact strings "true"/"false" and treats everything else as no answer.
        assert "_as_bool(" in body


class TestFallbackProbesRatherThanAssumes:
    """A tier is only used if it can answer, not if it can be constructed.

    An Anthropic key with no credit left builds a perfectly valid client and
    fails on every call. A fallback keyed on construction failure therefore never
    fires — which is exactly what happened: a run refused to proceed because
    Claude could not answer, while a working Groq key sat unused in the same
    environment.
    """

    SOURCE = __import__("pathlib").Path(
        "agents/news_monitor/classify.py"
    ).read_text(encoding="utf-8")

    def test_each_tier_is_probed(self):
        build = self.SOURCE[self.SOURCE.index("def build_classifier") :]
        # Both language-model tiers are gated on actually answering.
        assert build.count("_works(") >= 2

    def test_probe_calls_the_classifier(self):
        works = self.SOURCE[self.SOURCE.index("def _works(") :]
        body = works[: works.index("def build_classifier")]
        assert "classifier.classify(**PROBE)" in body
        assert "is not None" in body

    def test_probe_failure_falls_through_rather_than_raising(self):
        works = self.SOURCE[self.SOURCE.index("def _works(") :]
        body = works[: works.index("def build_classifier")]
        assert "except Exception" in body and "return False" in body

    def test_a_built_but_unusable_claude_is_reported_as_such(self):
        """The operator needs to know the difference between a missing key and a
        spent balance; they look identical from the outside otherwise."""
        assert "could not answer a test headline" in self.SOURCE
        assert "exhausted credit balance" in self.SOURCE


class TestVerdictParsing:
    """What counts as an answer from a model.

    A verdict decides whether an article becomes an incident on a safety card,
    so the parsing has to be forgiving about packaging and strict about meaning.
    """

    def test_real_booleans(self):
        from agents.news_monitor.classify import _as_bool

        assert _as_bool(True) is True
        assert _as_bool(False) is False

    def test_string_booleans_are_accepted(self):
        """Models in JSON mode emit these routinely, and they mean exactly one
        thing. Rejecting them silently discards good classifications."""
        from agents.news_monitor.classify import _as_bool

        assert _as_bool("true") is True
        assert _as_bool("FALSE") is False
        assert _as_bool("  True  ") is True

    def test_anything_ambiguous_is_no_answer(self):
        """1, 0, "yes" and "maybe" are not verdicts. General truthiness coercion
        is how a model's hedge becomes a number on a safety card."""
        from agents.news_monitor.classify import _as_bool

        for value in (1, 0, "yes", "no", "maybe", None, "", [], {}):
            assert _as_bool(value) is None, value

    def test_markdown_fences_are_stripped(self):
        """Smaller models fence their JSON even when told not to. The payload
        inside is still required to be valid JSON — this only declines to fail
        over packaging."""
        source = __import__("pathlib").Path(
            "agents/news_monitor/classify.py"
        ).read_text(encoding="utf-8")
        groq = source[source.index("class GroqClassifier") :]
        assert 'raw.startswith("```")' in groq


class TestClassifiersAreWellFormed:
    """Every method a classifier calls on itself must exist.

    GroqClassifier shipped with three calls to self._report and no _report
    method. Nothing caught it: the calls sit on error paths, so the class
    imports, constructs, and only fails when something else has already gone
    wrong — turning a diagnosable API error into
    "AttributeError: no attribute '_report'" at exactly the moment the real
    reason was needed.
    """

    def test_every_self_call_resolves(self):
        import ast
        import pathlib

        source = pathlib.Path("agents/news_monitor/classify.py").read_text(
            encoding="utf-8"
        )
        tree = ast.parse(source)

        for node in tree.body:
            if not isinstance(node, ast.ClassDef):
                continue

            defined = {
                item.name
                for item in node.body
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef))
            } | {
                target.id
                for item in node.body
                if isinstance(item, ast.Assign)
                for target in item.targets
                if isinstance(target, ast.Name)
            }

            # Attributes assigned in __init__ count as defined.
            for item in ast.walk(node):
                if isinstance(item, ast.Attribute) and isinstance(
                    item.ctx, ast.Store
                ):
                    if isinstance(item.value, ast.Name) and item.value.id == "self":
                        defined.add(item.attr)

            used = {
                item.attr
                for item in ast.walk(node)
                if isinstance(item, ast.Attribute)
                and isinstance(item.ctx, ast.Load)
                and isinstance(item.value, ast.Name)
                and item.value.id == "self"
            }

            missing = used - defined
            assert not missing, f"{node.name} calls undefined self.{missing}"


class TestGroqPacing:
    """The free tier meters tokens per minute, and that is the binding limit.

    Measured on a real account: 8,000 tokens/minute, and one classification
    costs 524 (450 of them the system prompt, resent every call because Groq has
    no prompt caching). That is about fifteen classifications a minute. Eight
    concurrent workers would empty the bucket in two seconds and spend the rest
    of the run collecting 429s.
    """

    SOURCE = __import__("pathlib").Path(
        "agents/news_monitor/classify.py"
    ).read_text(encoding="utf-8")

    def test_a_rate_is_declared(self):
        from agents.news_monitor.classify import GroqClassifier

        assert 0 < GroqClassifier.CALLS_PER_MINUTE <= 15

    def test_every_call_waits_its_turn(self):
        groq = self.SOURCE[self.SOURCE.index("class GroqClassifier") :]
        body = groq[: groq.index("def _as_bool")]
        assert body.index("self._wait_turn()") < body.index(
            "self._client.chat.completions.create"
        )

    def test_pacing_is_shared_across_threads(self):
        """The limit is per account, not per worker, so the interval has to be
        held under a lock the workers share."""
        assert "self._pace_lock = threading.Lock()" in self.SOURCE

    def test_the_rate_is_overridable(self):
        """Limits differ per account and per model, and a wrong constant should
        not need a code change."""
        assert "GROQ_CALLS_PER_MINUTE" in self.SOURCE

    def test_pacing_holds_under_concurrency(self):
        import threading
        import time
        from concurrent.futures import ThreadPoolExecutor

        from agents.news_monitor.classify import GroqClassifier

        # Exercise the pacing without constructing a client or needing a key.
        paced = object.__new__(GroqClassifier)
        paced._pace_lock = threading.Lock()
        paced._next_call_at = 0.0
        paced._min_interval = 0.05

        started = time.monotonic()
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(lambda _: paced._wait_turn(), range(8)))
        elapsed = time.monotonic() - started

        # Seven gaps between eight calls, allowing for scheduler slop.
        assert elapsed >= 0.05 * 7 * 0.8, elapsed
