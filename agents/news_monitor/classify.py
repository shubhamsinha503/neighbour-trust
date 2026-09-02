"""Deciding whether a news mention is actually a locality-specific incident.

This is the step docs/strategy.md calls for: "an extraction agent then reads each
candidate article, decides whether it actually describes a location-specific
incident (vs a city-wide policy story), pulls out the locality name, date, and
incident type". It is also the first place in this project where an LLM earns its
place — air quality and schools are arithmetic over structured feeds, but
separating "chain snatching in Koramangala" from "Karnataka announces new policing
budget" is a judgement about text.

Why it can't be skipped: a GDELT search for "Indiranagar" returns, in the same
response, an article about Indiranagar's footpaths, a stabbing in Maharashtra,
and a Marathi story about Paithan. Counting raw keyword hits as incidents would
produce a safety number driven mostly by noise, in the category the strategy doc
already flags as the weakest and most easily misrepresented.

Two implementations behind one protocol:

  * `HeuristicClassifier` — free, no credentials, deliberately strict. Rejects
    anything it cannot justify, so it under-counts rather than over-counts.
  * `ClaudeClassifier` — needs ANTHROPIC_API_KEY. Reads each headline and judges
    it, with a structured response so the result is parsed rather than scraped.

The heuristic is not a stand-in for the Claude one — it is the honest floor.
Where it cannot tell, it says so, and the mention stays unclassified rather than
being counted either way.
"""

from __future__ import annotations

import logging
import json
import os
import re
from dataclasses import dataclass
from typing import Optional, Protocol

log = logging.getLogger(__name__)


@dataclass
class Judgement:
    """One classification decision."""

    is_locality_specific: bool
    incident_type: Optional[str]
    reason: str
    classifier: str


class Classifier(Protocol):
    name: str

    def classify(
        self, *, title: str, locality: str, city: str, category: str
    ) -> Optional[Judgement]:
        """Judge one mention, or return None if this classifier cannot decide."""
        ...


# ---------------------------------------------------------------------------
# Heuristic
# ---------------------------------------------------------------------------

# Incident vocabulary per category. Presence of one of these plus the locality
# name in the headline is weak evidence of a specific incident.
INCIDENT_TERMS: dict[str, dict[str, tuple[str, ...]]] = {
    "crime": {
        "theft": ("theft", "stolen", "burglary", "burgled", "robbery", "robbed", "snatch"),
        "assault": ("assault", "attacked", "stabbed", "stabbing", "beaten"),
        "murder": ("murder", "killed", "body found"),
        "harassment": ("molest", "harass", "stalk", "eve-teasing"),
        "fraud": ("cheated", "fraud", "duped", "scam"),
    },
    "water": {
        "shortage": ("no water", "water shortage", "dry taps", "water crisis", "supply hit"),
        "tanker_dependence": ("tanker", "water tanker"),
        "contamination": ("contaminat", "sewage", "polluted water", "dirty water"),
        "waterlogging": ("waterlog", "flooded", "flooding", "inundat"),
        "infrastructure": ("pipeline burst", "pipe burst", "leak"),
    },
}

# Headlines about policy, budgets and announcements are city or state level even
# when they name a locality. These are the strongest single signal of a
# non-incident, and the exact failure mode the strategy doc names.
POLICY_MARKERS = (
    "policy", "budget", "scheme", "launch", "inaugurat", "announce", "plan to",
    "proposal", "tender", "approved", "sanction", "to be built", "survey",
    "minister", "cm ", "chief minister", "election", "manifesto",
)


class HeuristicClassifier:
    """Keyword classification with a deliberately low ceiling.

    Returns None — "I cannot tell" — far more often than it returns a verdict.
    That is the point: an unclassified mention is excluded from counts, so being
    unsure costs recall, while guessing would cost correctness in the category
    where the product's honesty matters most.
    """

    name = "heuristic"

    def classify(
        self, *, title: str, locality: str, city: str, category: str
    ) -> Optional[Judgement]:
        text = title.lower()
        locality_l = locality.lower()

        # The locality must be named in the headline itself. GDELT matched on the
        # full article body, which is how a Maharashtra stabbing surfaced under
        # an Indiranagar query.
        if locality_l not in text:
            return Judgement(
                is_locality_specific=False,
                incident_type=None,
                reason=f"headline does not name {locality}",
                classifier=self.name,
            )

        if any(marker in text for marker in POLICY_MARKERS):
            return Judgement(
                is_locality_specific=False,
                incident_type=None,
                reason="reads as policy or announcement coverage, not an incident",
                classifier=self.name,
            )

        for incident_type, terms in INCIDENT_TERMS.get(category, {}).items():
            if any(term in text for term in terms):
                return Judgement(
                    is_locality_specific=True,
                    incident_type=incident_type,
                    reason=f"headline names {locality} and describes {incident_type}",
                    classifier=self.name,
                )

        # Locality named, no policy marker, no incident vocabulary — genuinely
        # ambiguous from a headline alone. Leave it for a better classifier.
        return None


# ---------------------------------------------------------------------------
# Claude
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You classify Indian local-news headlines for a neighbourhood \
data product used by home buyers.

For each headline decide whether it describes a SPECIFIC INCIDENT that happened \
IN the named locality.

Answer false when the headline is:
- about a different place that merely shares a name, or a different city entirely
- using the locality name as part of a PERSON'S name rather than as a place. Indian news routinely identifies people by their town: "Monu Manesar" is a man, not the town of Manesar, and a murder case he is involved in is not a murder in Manesar. Ask whether the name is naming a person or locating an event.
- about a NATIONAL INSTITUTION that happens to sit in the locality — a defence establishment, a central training academy, a university, a large factory or industrial estate. These generate statewide and national coverage that says nothing about the streets around them. A labour dispute at an industrial estate, or a course run at a training centre, is not a neighbourhood incident.
- city-wide or state-wide policy, budgets, announcements, launches, or surveys
- an opinion piece, listicle, property advertisement, or event listing
- about the locality but with no incident (a restaurant opening, a traffic diversion)

Answer true only when a real event occurred in that locality: a theft, an \
assault, a water shortage, a burst pipeline, flooding, and so on.

Be conservative, and weigh the two errors differently. Missing a real incident \
costs one data point among many. A false positive becomes a number on a safety \
card telling someone a neighbourhood is dangerous, and these compound: a single \
nationally-covered story about a man named after a town produced 25 murders for \
a locality of a few thousand people. When the connection to the locality is not \
clear from the headline itself, answer false."""


class ClaudeClassifier:
    """Judges each headline with Claude, using structured output.

    Structured output rather than free text so the result is parsed, not scraped:
    a classifier whose output format can drift is a classifier that fails
    silently. Low max_tokens because the answer is a verdict and a short reason,
    not an essay.
    """

    def __init__(self, model: Optional[str] = None) -> None:
        try:
            import anthropic  # imported lazily so the agent runs without the dep
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "The anthropic package is not installed. Run: pip install anthropic"
            ) from exc

        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise RuntimeError(
                "ANTHROPIC_API_KEY is not set — needed to classify news mentions.\n"
                "Get one at: https://console.anthropic.com/settings/keys\n"
                "Then add it to .env at the repo root."
            )

        self._model = model or os.environ.get("NEWS_CLASSIFIER_MODEL", "claude-opus-5")

        # Identity-linked API keys (the kind issued to a user rather than to an
        # organisation) must name the workspace each request acts in, otherwise
        # the API returns 400 before doing any work. Plain org keys ignore the
        # header, so sending it when present is safe either way.
        workspace = os.environ.get("ANTHROPIC_WORKSPACE_ID", "").strip()
        headers = {"anthropic-workspace-id": workspace} if workspace else None

        self._client = anthropic.Anthropic(default_headers=headers)
        self.name = f"claude:{self._model}"

    def classify(
        self, *, title: str, locality: str, city: str, category: str
    ) -> Optional[Judgement]:
        prompt = (
            f"Locality: {locality}, {city}\n"
            f"Category: {category}\n"
            f"Headline: {title}"
        )

        try:
            response = self._client.messages.create(
                model=self._model,
                max_tokens=256,
                system=SYSTEM_PROMPT,
                # The system prompt is identical on every call, so caching it
                # turns the dominant cost of a few-hundred-article run into a
                # cache read.
                cache_control={"type": "ephemeral"},
                output_config={
                    "format": {
                        "type": "json_schema",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "is_locality_specific": {"type": "boolean"},
                                "incident_type": {
                                    "type": ["string", "null"],
                                    "description": (
                                        "Short snake_case label, e.g. theft, assault, "
                                        "water_shortage, waterlogging. Null if not an incident."
                                    ),
                                },
                                "reason": {
                                    "type": "string",
                                    "description": "One short sentence.",
                                },
                            },
                            "required": ["is_locality_specific", "incident_type", "reason"],
                            "additionalProperties": False,
                        },
                    }
                },
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception as exc:
            # One bad classification must not lose the run; the mention stays
            # unclassified and is excluded from counts.
            log.warning("Claude classification failed for %r: %s", title[:60], exc)
            return None

        import json

        text = next((b.text for b in response.content if b.type == "text"), None)
        if not text:
            return None
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            log.warning("Claude returned unparseable JSON for %r", title[:60])
            return None

        return Judgement(
            is_locality_specific=bool(data.get("is_locality_specific")),
            incident_type=_clean_type(data.get("incident_type")),
            reason=str(data.get("reason") or "")[:400],
            classifier=self.name,
        )


class GroqClassifier:
    """Judges headlines through Groq's API.

    Exists because the classifier is the one part of this system with a per-item
    cost, and running out of credit stops the news pipeline dead — which it did,
    leaving 802 headlines unjudged and every safety card reading "0% assessed".
    Groq's free tier removes that as a single point of failure.

    It shares the system prompt with the Claude classifier deliberately. The
    prompt encodes hard-won judgements — that "Monu Manesar" is a man rather than
    a town, that a labour dispute at an industrial estate is not a neighbourhood
    incident — and those are properties of the task, not of the model. Keeping one
    prompt means a lesson learned from one classifier's mistake improves both.

    The API is OpenAI-compatible, so this uses the `openai` client pointed at
    Groq's base URL rather than another SDK.

    Verdicts record which model produced them (`groq:<model>`), so a mixed corpus
    stays auditable and `--reclassify-from groq` can revisit just these if the
    quality turns out to be worse than Claude's.
    """

    # Chosen by measurement, not reputation. Groq's free tier serves no Llama
    # models at all — the first default, llama-3.3-70b-versatile, returned 404
    # "does not exist or you do not have access to it" despite being listed as a
    # production model in the public docs.
    #
    # Scored against seven real headlines including the two Manesar cases the
    # system prompt was written for ("Monu Manesar" naming a man, an NSG course
    # at a training academy):
    #
    #   qwen/qwen3.8-27b       7/7 correct   0.36 s/call
    #   openai/gpt-oss-120b    6/7 correct   0.94 s/call
    #   openai/gpt-oss-20b     5/7 correct   0.72 s/call, 1 undecided
    #
    # Override with GROQ_MODEL. `python -m scripts.check_classifier` reports what
    # an account can actually reach, which is the only reliable source for this.
    DEFAULT_MODEL = "qwen/qwen3.8-27b"

    def __init__(self, model: Optional[str] = None) -> None:
        try:
            from openai import OpenAI  # Groq speaks the OpenAI protocol
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "The openai package is not installed. Run: pip install openai"
            ) from exc

        key = os.environ.get("GROQ_API_KEY")
        if not key:
            raise RuntimeError(
                "GROQ_API_KEY is not set.\n"
                "Get a free key at: https://console.groq.com/keys\n"
                "Then add it to .env at the repo root."
            )

        self._model = model or os.environ.get("GROQ_MODEL", self.DEFAULT_MODEL)
        self._client = OpenAI(api_key=key, base_url="https://api.groq.com/openai/v1")
        self.name = f"groq:{self._model}"

        # A classifier that declines is indistinguishable from one that is
        # broken, and both look like "could not answer a test headline". The
        # first failure of a run is reported in full so the cause is visible —
        # a decommissioned model, a rejected key and a rate limit are three
        # different problems with three different fixes. Later failures stay
        # quiet so a thousand-headline run does not bury its own summary.
        self._reported_failure = False

    def _report(self, problem: object) -> None:
        """Say what went wrong, once per run.

        A classifier that declines is indistinguishable from one that is broken:
        both surface as "could not answer a test headline", and a rejected key, a
        decommissioned model, a spent quota and a malformed response are four
        different problems with four different fixes. The first failure of a run
        is reported in full; the rest stay at DEBUG so a thousand-headline run
        does not bury its own summary.
        """
        if self._reported_failure:
            log.debug("groq: %s", problem)
            return
        self._reported_failure = True
        log.warning(
            "Groq (%s) failed: %s\n"
            "  If this names a decommissioned model, set the GROQ_MODEL "
            "repository variable to a current id from "
            "https://console.groq.com/docs/models",
            self._model,
            problem,
        )


    def classify(
        self, *, title: str, locality: str, city: str, category: str
    ) -> Optional[Judgement]:
        prompt = (
            f"Locality: {locality}, {city}\n"
            f"Category: {category}\n"
            f"Headline: {title}"
        )

        try:
            response = self._client.chat.completions.create(
                model=self._model,
                # Generous because several models on Groq reason before
                # answering, and those tokens count. gpt-oss-20b hit
                # "max completion tokens reached before generating a valid
                # document" at 256 — the model was working, the ceiling was not.
                max_tokens=1024,
                temperature=0,
                # JSON mode rather than a free-text answer parsed with a regex.
                # A classifier whose output format can drift fails silently.
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": SYSTEM_PROMPT
                        + "\n\nRespond with JSON only, in exactly this shape:\n"
                        '{"is_locality_specific": true|false, '
                        '"incident_type": "short_snake_case" or null, '
                        '"reason": "one short sentence"}',
                    },
                    {"role": "user", "content": prompt},
                ],
            )
        except Exception as exc:
            # Declining to decide, not deciding wrongly. The mention stays
            # unclassified and is excluded from every count.
            self._report(exc)
            return None

        raw = (response.choices[0].message.content or "").strip()

        # Smaller models wrap JSON in a markdown fence even when asked not to.
        # Stripping one is not lenient parsing — the payload inside is still
        # required to be valid JSON — it just declines to fail over packaging.
        if raw.startswith("```"):
            raw = raw.split("```")[1] if "```" in raw[3:] else raw[3:]
            if raw.lstrip().startswith("json"):
                raw = raw.lstrip()[4:]
            raw = raw.strip()

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            self._report(f"returned unparseable JSON: {raw[:160]!r}")
            return None

        verdict = _as_bool(data.get("is_locality_specific"))
        if verdict is None:
            # A model that will not commit to true or false has not classified
            # anything. _as_bool accepts the literal strings "true" and "false",
            # which Llama models emit in JSON mode and which are unambiguous —
            # but nothing else. General truthiness coercion is how a "maybe"
            # becomes a number on a safety card.
            self._report(
                f"gave no usable verdict: is_locality_specific="
                f"{data.get('is_locality_specific')!r}"
            )
            return None

        return Judgement(
            is_locality_specific=verdict,
            incident_type=_clean_type(data.get("incident_type")),
            reason=str(data.get("reason") or "")[:400],
            classifier=self.name,
        )


def _as_bool(raw: object) -> Optional[bool]:
    """A verdict, or None if the model did not give one.

    Accepts a real boolean, and the exact strings "true"/"false" — which models
    in JSON mode emit routinely and which mean exactly one thing. Everything
    else, including 1, 0, "yes" and "maybe", is treated as no answer: an
    unclassified mention is excluded from every count, which is the right cost
    for ambiguity here.
    """
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, str) and raw.strip().lower() in ("true", "false"):
        return raw.strip().lower() == "true"
    return None


def _clean_type(raw: object) -> Optional[str]:
    if not raw or not isinstance(raw, str):
        return None
    slug = re.sub(r"[^a-z0-9_]+", "_", raw.strip().lower()).strip("_")
    return slug[:40] or None


# A headline with an obvious answer, used to check that a classifier can
# actually answer before a run depends on it.
PROBE = {
    "title": "Two held for chain snatching near the market",
    "locality": "Koramangala",
    "city": "Bengaluru",
    "category": "crime",
}


def _works(classifier: Classifier) -> bool:
    """Whether this classifier can answer a question, not merely be constructed.

    The distinction is the whole point. An Anthropic key with no credit left
    builds a perfectly valid client and fails on every call, so a fallback that
    triggers on construction failure never triggers at all. That is exactly what
    happened: a run refused to proceed because Claude could not answer, while a
    working Groq key sat unused in the environment.

    Costs one classification. Cheap against a run that would otherwise judge
    nothing.
    """
    try:
        return classifier.classify(**PROBE) is not None
    except Exception:
        return False


def build_classifier(prefer_claude: bool = True) -> Classifier:
    """The best classifier that actually answers, falling back loudly.

    Claude, then Groq, then the heuristic. The first two are language models
    reading the same system prompt; the third is keyword matching that declines
    to decide most of the time, so dropping to it is a material loss of quality
    rather than graceful degradation — which is why each step down says so.

    Each tier is probed rather than assumed. The classifier is the only per-item
    cost in this system and exhausting it stops the news pipeline dead: that
    happened, leaving 802 headlines unjudged and every safety card reading
    "0% assessed". A free second tier only helps if the code reaches it.
    """
    if prefer_claude and os.environ.get("ANTHROPIC_API_KEY"):
        try:
            claude = ClaudeClassifier()
            if _works(claude):
                return claude
            log.warning(
                "Claude built but could not answer a test headline — usually an "
                "exhausted credit balance. Trying Groq."
            )
        except Exception as exc:
            log.warning("Claude classifier unavailable (%s); trying Groq", exc)

    if os.environ.get("GROQ_API_KEY"):
        try:
            groq = GroqClassifier()
            if _works(groq):
                log.info("Using %s (free tier)", groq.name)
                return groq
            log.warning("Groq built but could not answer a test headline.")
        except Exception as exc:
            log.warning("Groq classifier unavailable (%s); using heuristic", exc)

    log.warning(
        "No language-model classifier could answer (set ANTHROPIC_API_KEY or "
        "GROQ_API_KEY, and check both have quota) — falling back to the "
        "heuristic. It leaves ambiguous headlines unclassified, so incident "
        "counts will under-report."
    )
    return HeuristicClassifier()
