"""Headlines that name a locality without being about it.

A stopgap, and scoped like one.

Applied when building envelopes rather than when classifying, which is the point
of it existing. Classification is idempotent — a judged mention is never
re-judged — so fixing a classifier mistake normally means paying to re-judge the
whole corpus. These rules run over already-stored verdicts, so they take effect
on the next ordinary run at no API cost. That matters when there is no API budget
to spend.

**What this is not.** The first version of this file tried to detect the pattern
generically: a capitalised word before the locality name suggests a person, an
institution keyword suggests an institution. Measured against 343 real headlines
it dropped genuine incidents — "Man arrested for molesting woman in Bengaluru's
Koramangala" (a possessive, not a name), "Three Whitefield family members shot"
(a quantifier), and "Bullets rain in Manesar: revenge killing caught on CCTV;
ex-NSG commando killed" (a real local murder, thrown out because the victim was
ex-NSG). Title-case verbs did the same: "Karnataka HC Warns Whitefield Police".

Suppressing real incidents from a safety page is the same failure as inventing
them, so the general version is not here. Telling a name from a place needs the
classifier, which can read the sentence — see the prompt in classify.py.

**What this is.** An explicit list of phrases verified by reading the articles.
Precise, dull, and safe: it can only remove what is named here.
"""

from __future__ import annotations

import re
from typing import Any, Optional

# (locality, phrase, why) — every entry read and confirmed by hand.
#
# Manesar's safety card read "25 murder" for a locality of a few thousand people.
# "Monu Manesar" is a man: a figure in the nationally covered Junaid-Nasir
# lynching case, whose events happened in Rajasthan. Indian news identifies
# people by their town, so each article about him counted as a murder here. Six
# of the first twenty-five headlines were his.
VERIFIED_EXCLUSIONS: tuple[tuple[str, str, str], ...] = (
    (
        "Manesar",
        "monu manesar",
        "names a man involved in a Rajasthan case, not this locality",
    ),
)


def exclusion_reason(title: str, locality: str) -> Optional[str]:
    """Why this headline is not evidence about this locality, if it isn't."""
    lowered = title.lower()
    for entry_locality, phrase, why in VERIFIED_EXCLUSIONS:
        if entry_locality.lower() != locality.lower():
            continue
        if re.search(r"\b" + re.escape(phrase) + r"\b", lowered):
            return f"'{phrase}' {why}"
    return None


def filter_incidents(
    incidents: list[dict[str, Any]], *, locality: str
) -> tuple[list[dict[str, Any]], list[tuple[str, str]]]:
    """Split confirmed incidents into those about the locality and those not.

    Returns (kept, [(title, reason), ...]). The rejected list is returned rather
    than discarded so a run can report what it dropped and why — a silent filter
    is how you end up unable to explain your own numbers.
    """
    kept: list[dict[str, Any]] = []
    dropped: list[tuple[str, str]] = []

    for incident in incidents:
        reason = exclusion_reason(incident.get("title") or "", locality)
        if reason:
            dropped.append((incident.get("title") or "", reason))
        else:
            kept.append(incident)

    return kept, dropped
