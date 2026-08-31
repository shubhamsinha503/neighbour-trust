"""Confidence decay at read time.

The bug this fixes: confidence was computed once, when an envelope was written,
and then served unchanged forever. On 2026-08-31 the API was returning
`confidence: "medium"` for an air quality reading taken on 2026-08-17 — thirteen
days old — because that was an honest label on the day it was stored and nothing
ever re-examined it.

Staleness is the one property of a stored value that changes without anybody
writing to it. So it has to be evaluated when the value is read, not when it is
written. The agents still compute confidence at write time from everything they
know then (station distance, source quality, vintage); this narrows that down
afterwards based only on how much time has since passed.

Two rules, applied in this order:

  1. **Degrade** — a reading past its category's freshness window cannot claim
     the confidence it had when fresh.
  2. **Withhold** — past a further limit, it should not be served as current at
     all. `/api/.../air-quality` returns its no-data response instead, which is a
     real answer the product is built to give.

Categories differ because their data does. An air quality reading describes a
moment and is worthless a week later. A UDISE school survey describes a year;
it was already at the confidence floor when stored and does not get meaningfully
worse over the following fortnight.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from neighbour_trust_schema.envelope import Confidence

# Order matters: index in this list is how strong a claim the label makes.
_STRENGTH = [
    Confidence.LOW,
    Confidence.COMMUNITY_ESTIMATED,
    Confidence.MEDIUM,
    Confidence.HIGH,
]


@dataclass(frozen=True)
class FreshnessPolicy:
    """How a category's confidence decays with age."""

    # Past this, confidence cannot exceed MEDIUM.
    degrade_to_medium_after: Optional[timedelta] = None
    # Past this, confidence cannot exceed LOW.
    degrade_to_low_after: Optional[timedelta] = None
    # Past this, do not serve the value as current at all.
    withhold_after: Optional[timedelta] = None


POLICIES: dict[str, FreshnessPolicy] = {
    # Air quality describes a moment. CPCB publishes hourly, so a reading a day
    # old is already a poor description of today and a week-old one is fiction.
    # These mirror the thresholds the agent applies at write time
    # (agents/air_quality/agent.py) so a value cannot be labelled one way when
    # stored and another when read.
    "air_quality": FreshnessPolicy(
        degrade_to_medium_after=timedelta(hours=3),
        degrade_to_low_after=timedelta(hours=24),
        withhold_after=timedelta(days=7),
    ),
    # Schools describes an academic year and is stored at LOW already — the 2022
    # UDISE snapshot cannot decay below the floor it starts on. No withholding:
    # "here are the schools, the staffing data is from 2022" stays true and
    # useful indefinitely, and the card says so in words.
    "schools": FreshnessPolicy(),
}


def _cap(confidence: Confidence, ceiling: Confidence) -> Confidence:
    """Lower `confidence` to `ceiling` if it currently claims more."""
    if _STRENGTH.index(confidence) > _STRENGTH.index(ceiling):
        return ceiling
    return confidence


@dataclass(frozen=True)
class Freshness:
    confidence: Confidence
    age: timedelta
    withhold: bool
    reason: Optional[str] = None
    degraded_from: Optional[Confidence] = None


def evaluate(
    *,
    category: str,
    stored_confidence: Confidence | str,
    data_vintage: datetime,
    now: Optional[datetime] = None,
) -> Freshness:
    """Confidence a stored envelope still deserves, given how old it now is."""
    now = now or datetime.now(timezone.utc)
    if data_vintage.tzinfo is None:
        data_vintage = data_vintage.replace(tzinfo=timezone.utc)

    stored = (
        stored_confidence
        if isinstance(stored_confidence, Confidence)
        else Confidence(stored_confidence)
    )
    age = now - data_vintage
    policy = POLICIES.get(category, FreshnessPolicy())

    if policy.withhold_after is not None and age > policy.withhold_after:
        return Freshness(
            confidence=Confidence.LOW,
            age=age,
            withhold=True,
            reason=(
                f"The most recent reading we have is {_describe(age)} old, which is too "
                "stale to present as current. The upstream feed appears to have stopped "
                "publishing — we would rather show nothing than a number that looks live "
                "and isn't."
            ),
            degraded_from=stored,
        )

    confidence = stored
    if policy.degrade_to_low_after is not None and age > policy.degrade_to_low_after:
        confidence = _cap(confidence, Confidence.LOW)
    elif policy.degrade_to_medium_after is not None and age > policy.degrade_to_medium_after:
        confidence = _cap(confidence, Confidence.MEDIUM)

    return Freshness(
        confidence=confidence,
        age=age,
        withhold=False,
        degraded_from=stored if confidence != stored else None,
    )


def _describe(age: timedelta) -> str:
    if age.days >= 2:
        return f"{age.days} days"
    hours = int(age.total_seconds() // 3600)
    if hours >= 2:
        return f"{hours} hours"
    return f"{int(age.total_seconds() // 60)} minutes"
