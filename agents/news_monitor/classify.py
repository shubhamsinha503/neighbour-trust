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
- city-wide or state-wide policy, budgets, announcements, launches, or surveys
- an opinion piece, listicle, property advertisement, or event listing
- about the locality but with no incident (a restaurant opening, a traffic diversion)

Answer true only when a real event occurred in that locality: a theft, an \
assault, a water shortage, a burst pipeline, flooding, and so on.

Be conservative. A false positive becomes a number on a buyer's safety card that \
nothing else supports."""


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
        self._client = anthropic.Anthropic()
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


def _clean_type(raw: object) -> Optional[str]:
    if not raw or not isinstance(raw, str):
        return None
    slug = re.sub(r"[^a-z0-9_]+", "_", raw.strip().lower()).strip("_")
    return slug[:40] or None


def build_classifier(prefer_claude: bool = True) -> Classifier:
    """The best classifier available, falling back loudly rather than silently."""
    if prefer_claude and os.environ.get("ANTHROPIC_API_KEY"):
        try:
            return ClaudeClassifier()
        except Exception as exc:
            log.warning("Claude classifier unavailable (%s); using heuristic", exc)
    else:
        log.warning(
            "ANTHROPIC_API_KEY not set — using the heuristic classifier. It leaves "
            "ambiguous headlines unclassified, so incident counts will under-report."
        )
    return HeuristicClassifier()
