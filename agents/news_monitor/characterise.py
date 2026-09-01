"""Turning classified incidents into a description of a place.

This is the distinction the product rests on for crime and water. *How many*
articles mention a locality is mostly a fact about media attention — Koramangala
is saturated with English-language coverage, an outer Gurugram sector is not, and
counting articles would rank the well-covered neighbourhood as more dangerous.
*What kind* of incident gets reported survives that bias far better: a place
where the reported incidents are chain-snatchings is genuinely different from one
where they are murders, and the difference does not disappear because one area
has more journalists pointed at it.

So nothing here produces a score. It produces sentences a buyer can read and
weigh, with the raw incidents linked underneath.

Waterlogging deserves its own treatment and gets it below. Unlike crime, it is a
physical property of a location rather than an event that happens to be noticed:
if a road floods every monsoon, it is reported every monsoon, and the reporting
is evidence about drainage that no official Indian dataset publishes.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime
from typing import Any, Iterable, Optional

# Crime types grouped by what a buyer actually weighs differently. The exact
# labels come from the classifier, which is instructed to emit short snake_case
# types but is not constrained to a fixed list — so matching is by substring and
# anything unrecognised falls to "other" rather than being silently dropped.
VIOLENT = ("assault", "murder", "kidnap", "molest", "harass", "rape", "attack", "stab", "violence")
PROPERTY = ("theft", "robbery", "burglary", "snatch", "fraud", "cheat", "scam", "steal", "loot")

# Excluded from the crime characterisation entirely, rather than bucketed.
#
# Self-harm is not a crime against residents and says nothing about whether an
# area is safe to live in, and reporting suicides broken down by neighbourhood
# is precisely what press guidelines on suicide reporting caution against. It
# was appearing in production as "2 suicide" on Whitefield's safety card.
#
# Deaths in custody and policing complaints are removed for a different reason:
# they describe conduct by an institution, not risk to someone living there, and
# they cluster wherever a police station happens to be.
EXCLUDED = (
    "suicide", "self_harm", "selfharm", "self-harm",
    "custody", "illegal arrest", "illegal_arrest", "police misconduct",
    "police_misconduct", "custodial",
)

# Water types grouped by what they tell you about living there.
FLOODING = ("waterlog", "flood", "inundat", "drain")
SUPPLY = ("shortage", "tanker", "supply", "scarcity", "cut")
QUALITY = ("contamina", "sewage", "pollut", "quality", "dirty")

# Monsoon months in India. Waterlogging outside these is a different and more
# alarming signal than waterlogging during them.
MONSOON_MONTHS = (6, 7, 8, 9)

# Below this, a distribution is not a pattern. Three thefts is a character;
# one theft is an anecdote, and describing it as "mostly property crime" would
# dress a single article as a trend.
MIN_FOR_PATTERN = 3


def is_excluded(incident_type: Optional[str]) -> bool:
    text = (incident_type or "").lower()
    return any(needle in text for needle in EXCLUDED)


def _bucket(incident_type: Optional[str], groups: dict[str, tuple[str, ...]]) -> str:
    text = (incident_type or "").lower()
    for name, needles in groups.items():
        if any(needle in text for needle in needles):
            return name
    return "other"


def _readable(incident_type: str) -> str:
    return incident_type.replace("_", " ")


def _top_types(types: Iterable[str], limit: int = 3) -> str:
    counts = Counter(t for t in types if t)
    parts = [f"{n} {_readable(t)}" for t, n in counts.most_common(limit)]
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]
    return ", ".join(parts[:-1]) + " and " + parts[-1]


def characterise_crime(incidents: list[dict[str, Any]]) -> Optional[str]:
    """Describe the kind of crime reported, not the amount.

    Returns None rather than a vague sentence when there is too little to
    characterise — the count is shown separately either way.
    """
    if len(incidents) < MIN_FOR_PATTERN:
        return None

    groups = {"violent": VIOLENT, "property": PROPERTY}

    # Drop what does not belong on a neighbourhood safety card before counting,
    # so excluded items cannot show up in a total either.
    incidents = [i for i in incidents if not is_excluded(i.get("incident_type"))]
    if len(incidents) < MIN_FOR_PATTERN:
        return None

    def types_in(bucket: str) -> list[str]:
        return [
            i.get("incident_type")
            for i in incidents
            if _bucket(i.get("incident_type"), groups) == bucket
        ]

    buckets = Counter(_bucket(i.get("incident_type"), groups) for i in incidents)
    violent = buckets.get("violent", 0)
    prop = buckets.get("property", 0)

    # Each sentence below illustrates the claim it just made, using types drawn
    # from the bucket it named. Listing the overall most-common types instead
    # produced a live contradiction on Whitefield — "a notable share involve
    # violence (6 of 33) — 7 illegal arrest, 2 police misconduct and 2 suicide",
    # where not one of the three examples was a violent incident.
    if violent == 0:
        property_detail = _top_types(types_in("property"))
        if not property_detail:
            # Nothing violent and nothing recognisably property crime either.
            # "Property crime rather than violent crime" would be false, but the
            # absence of violence is still true and still worth saying.
            other = _top_types(types_in("other"))
            if not other:
                return None  # no usable type labels at all
            return (
                f"Nothing involving violence appeared in local press over the "
                f"year. Reported incidents were {other}."
            )
        return (
            f"Reported incidents are property crime rather than violent crime — "
            f"{property_detail}. Nothing involving violence appeared in local "
            f"press over the year."
        )
    if prop > violent * 2:
        return (
            f"Mostly property crime — {_top_types(types_in('property'))} — with "
            f"{violent} incident{'' if violent == 1 else 's'} involving violence "
            f"({_top_types(types_in('violent'))})."
        )
    if violent > prop:
        return (
            f"A notable share of reported incidents involve violence "
            f"({violent} of {len(incidents)}) — {_top_types(types_in('violent'))}."
        )
    return (
        f"A mix of property and violent incidents — "
        f"{_top_types(types_in('property'))} against "
        f"{_top_types(types_in('violent'))}."
    )


def characterise_water(incidents: list[dict[str, Any]]) -> Optional[str]:
    """Describe what kind of water problem this place has.

    Waterlogging is called out specifically, with its monsoon timing, because it
    is the one water signal that behaves like a property of the location rather
    than an artefact of who was reporting that week.
    """
    if len(incidents) < MIN_FOR_PATTERN:
        return None

    groups = {"flooding": FLOODING, "supply": SUPPLY, "quality": QUALITY}
    buckets = Counter(_bucket(i.get("incident_type"), groups) for i in incidents)

    flooding = buckets.get("flooding", 0)
    supply = buckets.get("supply", 0)
    quality = buckets.get("quality", 0)

    parts: list[str] = []
    if flooding:
        monsoon = sum(
            1
            for i in incidents
            if _bucket(i.get("incident_type"), groups) == "flooding"
            and _month(i.get("published_at")) in MONSOON_MONTHS
        )
        if monsoon == flooding and flooding >= 2:
            parts.append(
                f"waterlogging reported {flooding} times, all during the monsoon"
            )
        elif monsoon and monsoon < flooding:
            parts.append(
                f"waterlogging reported {flooding} times, {flooding - monsoon} of them "
                "outside the monsoon"
            )
        else:
            parts.append(f"waterlogging reported {flooding} time{'' if flooding == 1 else 's'}")

    if supply:
        parts.append(f"{supply} supply failure{'' if supply == 1 else 's'} or tanker dependence")
    if quality:
        parts.append(f"{quality} report{'' if quality == 1 else 's'} of contamination or sewage")

    if not parts:
        return None
    if len(parts) == 1:
        return parts[0][0].upper() + parts[0][1:] + "."
    joined = ", ".join(parts[:-1]) + " and " + parts[-1]
    return joined[0].upper() + joined[1:] + "."


def _month(published_at: Any) -> Optional[int]:
    if isinstance(published_at, datetime):
        return published_at.month
    if isinstance(published_at, str) and len(published_at) >= 7:
        try:
            return int(published_at[5:7])
        except ValueError:
            return None
    return None


def characterise(category: str, incidents: list[dict[str, Any]]) -> Optional[str]:
    if category == "crime":
        return characterise_crime(incidents)
    if category == "water":
        return characterise_water(incidents)
    return None
