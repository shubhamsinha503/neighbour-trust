"""Things about a locality worth putting in front of the reader.

A flag is not a score. It is a statement that something specific was reported,
raised out of the category grid so it is read rather than scanned past.

**Why this exists.** The watch-out mechanism only considered *scored* categories,
so safety and water — the two things a buyer most wants flagged — were
structurally incapable of being flagged at all. A locality with violent incidents
in the press showed a grey dash where a score would be, and the incidents
themselves sat in a tile among six. That is precisely backwards.

**Why these are not scores.** docs/strategy.md is firm that press coverage cannot
be normalised into a safety number: how often a place is written about tracks
media attention, so scoring it would rank a well-covered neighbourhood as more
dangerous than an identical one nobody reports on. That argument is about
*comparing localities*. It says nothing against reporting what was found in this
one, which is what a flag does.

**The asymmetry that keeps this honest.** A flag only ever fires on the presence
of something. Absence never produces a reassuring flag, because absence of
coverage is not evidence of safety — an under-reported locality would otherwise
be awarded a clean bill of health for being ignored. So there is a flag for
"violence was reported" and none for "no violence was reported".
"""

from __future__ import annotations

from collections import Counter
from typing import Any, Optional

from agents.news_monitor.characterise import (
    FLOODING,
    INFRA_FAULT,
    PLANNED,
    UNPLANNED,
    PROPERTY,
    QUALITY,
    SUPPLY,
    VIOLENT,
    _bucket,
    is_excluded,
)

# Ordering for display. Severity is about how much weight a reader should give
# the flag, not a measurement — "serious" is what changes a decision, "notable"
# is what someone would want to know but not be stopped by.
SEVERITY_ORDER = {"serious": 0, "notable": 1}

# Waterlogging reported this many times or more reads as a property of the place
# rather than one bad week.
RECURRENT_FLOODING = 2

# CPCB bands where air quality is worth raising on its own.
POOR_AIR_BANDS = ("poor", "very_poor", "severe")


def _incident_types(news: dict[str, Any]) -> list[str]:
    """Every confirmed incident type, not the five kept for display.

    `recent` is a sample sized for the card, and deriving a flag from it makes a
    statement about the sample while appearing to make one about the locality.
    That shipped: "Violence reported in local press (1 of 5 incidents shown)"
    sat directly above "a notable share involve violence (9 of 18)" on the same
    page, disagreeing with it.

    Falls back to `recent` only for envelopes written before the counts existed,
    which age out within a day of ingestion.
    """
    counts = news.get("incident_type_counts") or {}
    if counts:
        return [t for t, n in counts.items() for _ in range(int(n))]
    return [i.get("incident_type") for i in (news.get("recent") or [])]


def _crime_flags(payload: dict[str, Any]) -> list[dict[str, str]]:
    news = payload.get("news") or {}
    types = [t for t in _incident_types(news) if not is_excluded(t or "")]
    if not types:
        return []

    groups = {"violent": VIOLENT, "property": PROPERTY}
    buckets = Counter(_bucket(t, groups) for t in types)
    violent = buckets.get("violent", 0)
    property_crime = buckets.get("property", 0)

    flags: list[dict[str, str]] = []

    if violent:
        flags.append(
            {
                "category": "crime",
                "severity": "serious",
                "headline": f"Violence reported in local press ({violent} of "
                f"{len(types)} incidents)",
                "detail": "Press coverage is not a crime rate, and this is not a "
                "count of everything that happened. It is what local reporting "
                "described in the last year.",
            }
        )
    elif property_crime:
        # Deliberately still a flag rather than reassurance. It tells a reader
        # what kind of thing gets reported here without implying the place is safe.
        flags.append(
            {
                "category": "crime",
                "severity": "notable",
                "headline": f"Reported incidents are property crime "
                f"({property_crime} of {len(types)})",
                "detail": "No violent incidents appeared among the reports we "
                "read. That is not the same as none having happened.",
            }
        )

    return flags


def _water_flags(payload: dict[str, Any]) -> list[dict[str, str]]:
    news = payload.get("news") or {}
    types = _incident_types(news)
    if not types:
        return []

    groups = {"flooding": FLOODING, "supply": SUPPLY, "quality": QUALITY}
    buckets = Counter(_bucket(t, groups) for t in types)

    flags: list[dict[str, str]] = []
    flooding = buckets.get("flooding", 0)
    quality = buckets.get("quality", 0)
    supply = buckets.get("supply", 0)

    if flooding >= RECURRENT_FLOODING:
        flags.append(
            {
                "category": "water",
                "severity": "serious",
                "headline": f"Waterlogging reported {flooding} times in the last year",
                "detail": "Flooding is one of the few press signals that behaves "
                "like a property of a location rather than an artefact of who was "
                "reporting: a road that floods is reported every monsoon.",
            }
        )
    elif flooding:
        flags.append(
            {
                "category": "water",
                "severity": "notable",
                "headline": "Waterlogging reported here in the last year",
                "detail": "A single report. Worth asking residents about before "
                "reading anything into it.",
            }
        )

    if quality:
        flags.append(
            {
                "category": "water",
                "severity": "serious",
                "headline": "Contamination or sewage reported in local press",
                "detail": "No official water quality data covers this locality, "
                "so press reports are the only signal available.",
            }
        )

    if supply >= 2:
        flags.append(
            {
                "category": "water",
                "severity": "notable",
                "headline": f"Supply failures or tanker dependence reported "
                f"({supply} times)",
                "detail": "Tanker dependence is a recurring cost, not a one-off "
                "inconvenience.",
            }
        )

    return flags


def _power_flags(payload: dict[str, Any]) -> list[dict[str, str]]:
    news = payload.get("news") or {}
    types = _incident_types(news)
    if not types:
        return []

    # Equipment first, because _bucket returns the first group that matches and
    # the specific test has to run before the general one. "transformer_failure"
    # contains "failure", so with unplanned checked first every equipment fault
    # was silently counted as a generic outage and the repeated-fault flag could
    # never fire.
    groups = {"equipment": INFRA_FAULT, "planned": PLANNED, "unplanned": UNPLANNED}
    buckets = Counter(_bucket(t, groups) for t in types)
    unplanned = buckets.get("unplanned", 0)
    equipment = buckets.get("equipment", 0)

    if equipment >= 2:
        return [{
            "category": "power",
            "severity": "serious",
            "headline": f"Repeated equipment failures reported ({equipment} times)",
            "detail": "Transformer and feeder faults recur on the same "
            "infrastructure. No official outage record exists for any Indian "
            "locality, so this is press reporting rather than a measured rate.",
        }]
    if unplanned >= 2:
        return [{
            "category": "power",
            "severity": "notable",
            "headline": f"Unplanned outages reported ({unplanned} times in the year)",
            "detail": "Counted from local press. Scheduled maintenance is "
            "excluded from this figure.",
        }]
    return []


def _air_flags(payload: dict[str, Any]) -> list[dict[str, str]]:
    band = payload.get("aqi_band")
    if band not in POOR_AIR_BANDS:
        return []

    aqi = payload.get("current_aqi")
    reading = f"{round(aqi)} " if aqi is not None else ""
    label = band.replace("_", " ")

    detail = "Measured at the nearest station."
    if payload.get("aqi_basis") == "pm2_5_only":
        detail = (
            "From a community low-cost sensor measuring PM2.5 alone, with no "
            "regulatory station reporting — an indication rather than a "
            "measurement."
        )

    return [
        {
            "category": "air_quality",
            "severity": "serious" if band != "poor" else "notable",
            "headline": f"Air quality is {label} ({reading}index)",
            "detail": detail,
        }
    ]


def find(
    envelopes: dict[str, Any], categories: list[dict[str, Any]]
) -> list[dict[str, str]]:
    """Flags for one locality, most serious first.

    Reads the stored envelopes rather than the rendered cards, so a flag is
    always derived from the same data the card is.
    """
    flags: list[dict[str, str]] = []

    for category, builder in (
        ("crime", _crime_flags),
        ("water", _water_flags),
        ("power", _power_flags),
        ("air_quality", _air_flags),
    ):
        envelope = envelopes.get(category)
        if envelope is None:
            continue
        flags.extend(builder(envelope.get("payload") or {}))

    # A scored category doing badly is a watch-out in its own right, and this is
    # where the original biggest-watchout rule still applies.
    for result in categories:
        if not result.get("counted") or result.get("score") is None:
            continue
        if result["score"] >= 60 or result["category"] == "air_quality":
            continue  # air is flagged above, with its own wording
        flags.append(
            {
                "category": result["category"],
                "severity": "notable",
                "headline": f"{result['label']} scores {result['score']} out of 100",
                "detail": result.get("summary") or "",
            }
        )

    flags.sort(key=lambda f: SEVERITY_ORDER.get(f["severity"], 9))
    return flags


def headline_flag(flags: list[dict[str, str]]) -> Optional[dict[str, str]]:
    """The single one to lead with, if any.

    Loss aversion, per docs/strategy.md: a flagged risk is weighed about twice as
    heavily as an equivalent gain and remembered better. One prominent flag does
    more than six competing for attention.
    """
    return flags[0] if flags else None
