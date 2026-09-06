"""What residents told us, turned into something a card can show.

Press coverage is the only locality-grain source for safety, water and power
today, and it measures how closely a neighbourhood is reported on rather than
what happens there. A resident is the one source without that bias — and with
the opposite weakness. Press is indifferent about who is speaking and biased
about where; a report is exact about where and entirely unverified about who.

So reports are treated as **evidence, never as measurement**:

  - They raise flags. A flag says something was reported, names who reported it
    and how they knew, and lets the reader weigh it. That is a claim we can
    actually support.
  - They contradict a baseline. A locality showing the no-reports baseline of 80
    stops showing it the moment somebody says otherwise — the baseline means
    "nothing reported", and something has now been reported.
  - They do **not** produce a score of their own. Three neighbours describing bad
    water is worth showing a buyer; it is not a water score, and turning it into
    one would let a handful of motivated people set a number.

**Credibility is computed here, not stored.** The database keeps what the person
answered — how they know, what they are to the area — and the weighting of those
answers lives in this file. That follows the same rule as read-time confidence
and the Trust Score itself: judgement that we expect to argue with should never
be frozen into rows, or every revision becomes a backfill and the stored number
quietly disagrees with the current rule.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

# How much each answer is worth. A first-hand account from someone who lives
# there is the strongest thing this table can hold; a passer-by repeating
# something they read is the weakest that is still worth keeping.
#
# Nothing scores zero. A weak report is still a report, and dropping it would
# quietly discard exactly the accounts that are hardest to come by — people who
# have moved away, or who are considering the area and noticed something.
BASIS_WEIGHT: dict[str, float] = {
    "happened_to_me": 1.0,
    "witnessed": 0.9,
    "second_hand": 0.55,
    "read_it": 0.4,
    "unstated": 0.5,
}

TIE_WEIGHT: dict[str, float] = {
    "lives_here": 1.0,
    "works_here": 0.85,
    "lived_here": 0.7,
    "considering": 0.55,
    "visiting": 0.45,
    "unstated": 0.6,
}

# Reports age, but not the way a sensor reading does. A transformer that failed
# repeatedly last year still says something about the infrastructure, so this
# decays slowly and never to nothing.
FRESH_FOR = timedelta(days=180)
STALE_AFTER = timedelta(days=730)
MIN_AGE_WEIGHT = 0.35

# Below this total weight a locality's reports are shown but never allowed to
# displace the no-reports baseline. One weak second-hand account is worth
# reading and is not enough to overturn "nothing reported here".
MIN_WEIGHT_TO_DISPLACE_BASELINE = 1.0

# Corroboration is the only thing here that behaves like evidence rather than
# opinion: two people who do not know each other describing the same problem is
# a different claim from one person saying it twice.
CORROBORATION_BONUS = 0.25


def _age_weight(submitted_at: datetime, now: datetime) -> float:
    age = now - submitted_at
    if age <= FRESH_FOR:
        return 1.0
    if age >= STALE_AFTER:
        return MIN_AGE_WEIGHT
    span = (STALE_AFTER - FRESH_FOR).total_seconds()
    travelled = (age - FRESH_FOR).total_seconds() / span
    return 1.0 - travelled * (1.0 - MIN_AGE_WEIGHT)


def credibility(report: dict[str, Any], now: Optional[datetime] = None) -> float:
    """0-1 for one report, from what the person told us about themselves.

    Deliberately not a probability and not shown as a number. It orders reports
    and decides whether a group of them is substantial enough to displace a
    baseline; a percentage on a card would imply a calibration we do not have.
    """
    now = now or datetime.now(timezone.utc)
    submitted = report.get("submitted_at") or now
    basis = BASIS_WEIGHT.get(report.get("basis") or "unstated", 0.5)
    tie = TIE_WEIGHT.get(report.get("tie_to_area") or "unstated", 0.6)
    return round(basis * tie * _age_weight(submitted, now), 4)


def weigh(reports: list[dict[str, Any]], now: Optional[datetime] = None) -> float:
    """Combined weight of a group, with a bonus for independent corroboration."""
    if not reports:
        return 0.0
    total = sum(credibility(r, now) for r in reports)
    if len(reports) > 1:
        total += CORROBORATION_BONUS * (len(reports) - 1)
    return round(total, 4)


def displaces_baseline(reports: list[dict[str, Any]], now: Optional[datetime] = None) -> bool:
    """Whether these reports are enough to stop showing 'nothing reported'.

    The baseline means exactly that — nothing was reported. Any accepted report
    makes it false as a statement, but a single weak one is thin ground for
    replacing a locality's shown figure, so it takes either one solid account or
    more than one of any kind.
    """
    return weigh(reports, now) >= MIN_WEIGHT_TO_DISPLACE_BASELINE


# Severity is the moderator's classification, not the reporter's wording. A
# resident describing a frightening experience and a resident describing a
# recurring inconvenience both matter; only the first is a serious flag.
SERIOUS_TYPES = frozenset({
    "assault", "robbery", "murder", "kidnapping", "sexual_assault",
    "contamination", "sewage", "transformer_failure", "electrocution",
})


def to_flags(
    reports: list[dict[str, Any]], now: Optional[datetime] = None
) -> list[dict[str, str]]:
    """One flag per category that has accepted reports.

    Grouped rather than one flag each: five people reporting waterlogging is one
    finding about the road, not five findings competing for the reader's
    attention. The count is stated because it is the part that carries weight.
    """
    now = now or datetime.now(timezone.utc)
    by_category: dict[str, list[dict[str, Any]]] = {}
    for report in reports:
        by_category.setdefault(report["category"], []).append(report)

    flags: list[dict[str, str]] = []
    for category, group in sorted(by_category.items()):
        types = {r.get("incident_type") for r in group if r.get("incident_type")}
        serious = bool(types & SERIOUS_TYPES)
        n = len(group)
        people = "1 resident has" if n == 1 else f"{n} residents have"

        flags.append({
            "category": category,
            "severity": "serious" if serious else "notable",
            "headline": (
                f"{people} reported this directly"
                + (f" — {', '.join(sorted(types))}" if types else "")
            ),
            "detail": (
                "Sent in by people who live, work or have lived here, and checked "
                "by us before publishing. Resident accounts are not counted "
                "toward any score — they tell you what happened, not how often."
            ),
        })
    return flags
