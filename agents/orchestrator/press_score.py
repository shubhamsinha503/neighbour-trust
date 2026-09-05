"""Scoring the categories whose only source is local press.

Crime, water and power have no locality-level official record in India, so for a
long time this product refused to score them at all. That refusal was correct
about the danger and wrong about the consequence: it left 21 of 44 localities
with no Trust Score, which is most of the product.

**The danger, stated plainly.** How often a place appears in the press tracks
media attention, not incidence. Koramangala is saturated with English-language
coverage; an outer Gurugram sector is not. Score the *count* and the
well-covered neighbourhood is ranked as more dangerous than an identical one
nobody writes about — the ranking inverts reality, which is worse than no
ranking.

**What survives that bias.** Composition does. If two localities have the same
underlying reality and one gets three times the coverage, both still show a
similar *share* of reported incidents that involve violence, and both still show
whether flooding recurs. So these scores read the mix, not the volume.

Absolute counts are not ignored entirely — a place with fifteen reported violent
incidents is telling you something a place with one is not — but they enter
capped and secondary, so extra coverage can move a score a little and never
dominate it.

**Absence is never scored.** A locality with no confirmed incidents is not given
a neutral or generous number; it is left unscored and the card says no local
coverage was found. Awarding a good score for silence is the coverage bias
arriving through the front door, and it would quietly reward the least-reported
areas — exactly the ones a buyer can learn least about.

Everything here stays tagged community-estimated, and the coverage caveat stays
on the card. A number that is honest about its own basis is a different object
from one that hides it.
"""

from __future__ import annotations

from collections import Counter
from typing import Any, Optional

from agents.news_monitor.characterise import (
    FLOODING,
    INFRA_FAULT,
    PLANNED,
    PROPERTY,
    QUALITY,
    SUPPLY,
    UNPLANNED,
    VIOLENT,
    _bucket,
    is_excluded,
)

# Below this, a distribution is not a mix — it is one or two articles, and a
# share computed from them says more about chance than about the place.
MIN_FOR_SCORE = 3

# How far composition may move a score, and how far volume may. Composition
# leads because it is what survives coverage bias; volume is capped so a
# well-covered locality cannot be scored down for being written about.
COMPOSITION_WEIGHT = 45
VOLUME_WEIGHT = 18

# Where the volume term stops growing. Crime and the other two need different
# values because their counts live on different scales: localities show 1-96
# confirmed crime incidents but only 1-19 water or power ones, so a single
# saturation point either flattens crime or leaves water barely scratched.
# Three contamination reports scoring 87 was the symptom of using crime's.
CRIME_SATURATES_AT = 12
UTILITY_SATURATES_AT = 5


def _types(news: dict[str, Any]) -> list[str]:
    """Every confirmed incident type over the year, not the display sample."""
    counts = news.get("incident_type_counts") or {}
    if counts:
        return [t for t, n in counts.items() for _ in range(int(n))]
    return [i.get("incident_type") for i in (news.get("recent") or [])]


def _volume_penalty(
    n: int, weight: float = VOLUME_WEIGHT, saturates: int = CRIME_SATURATES_AT
) -> float:
    """A bounded, saturating penalty for how much was reported.

    Deliberately concave: the difference between one reported incident and five
    is meaningful, between thirty and thirty-five is mostly a fact about how many
    journalists cover the area.
    """
    return weight * min(n, saturates) / saturates


def _clamp(value: float) -> int:
    return max(5, min(100, round(value)))


def score_crime(payload: dict[str, Any]) -> Optional[int]:
    """Safety, from what kind of incident gets reported here.

    Violence dominates the score because it is what changes a decision, and
    because the violent share is the part of press data least distorted by how
    much a locality is covered.
    """
    news = payload.get("news") or {}
    types = [t for t in _types(news) if not is_excluded(t or "")]
    if len(types) < MIN_FOR_SCORE:
        return None

    groups = {"violent": VIOLENT, "property": PROPERTY}
    buckets = Counter(_bucket(t, groups) for t in types)
    violent = buckets.get("violent", 0)

    violent_share = violent / len(types)

    score = 100.0
    score -= COMPOSITION_WEIGHT * violent_share
    score -= _volume_penalty(violent)

    # Property crime is real and worth something, but an area with thefts and no
    # violence should still read clearly better than one with both.
    score -= _volume_penalty(buckets.get("property", 0), weight=8)

    return _clamp(score)


def score_water(payload: dict[str, Any]) -> Optional[int]:
    """Water, weighted toward the problems that are properties of a place.

    Recurrent flooding is the strongest signal press coverage carries: a road
    that floods is reported every monsoon, and that repetition is about drainage
    rather than about who was reporting that week. Contamination is treated as
    the most serious single finding, because no official source covers it at all.
    """
    news = payload.get("news") or {}
    types = _types(news)
    if len(types) < MIN_FOR_SCORE:
        return None

    groups = {"flooding": FLOODING, "supply": SUPPLY, "quality": QUALITY}
    buckets = Counter(_bucket(t, groups) for t in types)

    flooding = buckets.get("flooding", 0)
    supply = buckets.get("supply", 0)
    quality = buckets.get("quality", 0)

    score = 100.0
    score -= _volume_penalty(flooding, 30, UTILITY_SATURATES_AT)
    score -= _volume_penalty(quality, 32, UTILITY_SATURATES_AT)
    score -= _volume_penalty(supply, 20, UTILITY_SATURATES_AT)

    return _clamp(score)


def score_power(payload: dict[str, Any]) -> Optional[int]:
    """Power, weighted toward failure rather than maintenance.

    A scheduled shutdown is an inconvenience you can plan around; a transformer
    that keeps failing is a fact about the supply. Scoring them the same would
    penalise a utility for announcing its work, which is the opposite of what a
    buyer should be told.
    """
    news = payload.get("news") or {}
    types = _types(news)
    if len(types) < MIN_FOR_SCORE:
        return None

    groups = {"equipment": INFRA_FAULT, "planned": PLANNED, "unplanned": UNPLANNED}
    buckets = Counter(_bucket(t, groups) for t in types)

    score = 100.0
    score -= _volume_penalty(buckets.get("equipment", 0), 34, UTILITY_SATURATES_AT)
    score -= _volume_penalty(buckets.get("unplanned", 0), 24, UTILITY_SATURATES_AT)
    score -= _volume_penalty(buckets.get("planned", 0), 6, UTILITY_SATURATES_AT)

    return _clamp(score)


SCORERS = {"crime": score_crime, "water": score_water, "power": score_power}


def score(category: str, payload: dict[str, Any]) -> Optional[int]:
    scorer = SCORERS.get(category)
    return scorer(payload) if scorer else None
