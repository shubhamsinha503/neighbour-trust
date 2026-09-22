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


# ---------------------------------------------------------------------------
# Cross-city guard
# ---------------------------------------------------------------------------
#
# A locality name is not unique across India. "Anna Nagar" is a large, heavily
# reported Chennai neighbourhood; there is also one in Hyderabad, which we cover.
# The search deliberately does not put the city in the query (Indian local
# reporting names only the locality), so a query for our Hyderabad "Anna Nagar"
# returns Chennai's Anna Nagar coverage, and the title alone — "Anna Nagar's
# Second Avenue SWD works drags on for nine months" — gives the classifier no way
# to tell which city it is. The article's URL does: Indian outlets file city news
# under a city-section path (`/city/chennai/`, `/cities/chennai-news/`).
#
# So when the URL clearly sits in *another* city's section and the locality's own
# city is nowhere in the URL, the story is about the same-named place elsewhere.
# This is deliberately narrow: it fires only on that explicit section pattern,
# never on a bare token, so it cannot drop a genuine local incident whose outlet
# simply happens to mention another city.

# Cities whose news sections we may collide with. The locality's own city is
# removed from this set per-check, so only *foreign* cities can match.
_KNOWN_CITIES: tuple[str, ...] = (
    "chennai", "mumbai", "delhi", "new-delhi", "kolkata", "pune", "ahmedabad",
    "bengaluru", "bangalore", "hyderabad", "gurugram", "gurgaon", "noida",
    "jaipur", "chandigarh", "lucknow", "kochi", "coimbatore", "nagpur", "thane",
    "bhopal", "indore", "patna", "surat", "vadodara", "visakhapatnam", "bhubaneswar",
)

# A city string from our data → every token that legitimately means that city,
# so an article filed under either spelling counts as "our city".
_CITY_ALIASES: dict[str, tuple[str, ...]] = {
    "hyderabad": ("hyderabad", "secunderabad"),
    "bengaluru": ("bengaluru", "bangalore"),
    "bangalore": ("bengaluru", "bangalore"),
    "gurugram": ("gurugram", "gurgaon"),
    "gurgaon": ("gurugram", "gurgaon"),
    "mumbai": ("mumbai", "navi-mumbai"),
    "delhi": ("delhi", "new-delhi"),
}


def _own_city_tokens(city: str) -> set[str]:
    key = (city or "").strip().lower()
    return set(_CITY_ALIASES.get(key, (key,))) if key else set()


def _url_names_city(url: str, token: str) -> bool:
    """True if the URL files the article under this city's news section.

    Matches the section patterns Indian outlets use, not a bare occurrence, so a
    story that merely mentions the city in a slug word does not trip it.
    """
    u = url.lower()
    return (
        f"/city/{token}" in u
        or f"/cities/{token}" in u
        or f"/{token}-news" in u
        or f"/{token}/" in u
    )


def city_mismatch_reason(url: str, city: str) -> Optional[str]:
    """Why this URL is about a different city than the locality's, if it is.

    Conservative by design: returns a reason only when the URL is filed under
    exactly one foreign city's section and never under the locality's own city.
    """
    if not url or not city:
        return None
    own = _own_city_tokens(city)
    if any(_url_names_city(url, t) for t in own):
        return None  # the article's own section is our city — keep it
    for token in _KNOWN_CITIES:
        if token in own:
            continue
        if _url_names_city(url, token):
            return (
                f"URL is filed under {token.replace('-', ' ').title()}'s city "
                f"news section, not {city}"
            )
    return None


def filter_incidents(
    incidents: list[dict[str, Any]], *, locality: str, city: str = ""
) -> tuple[list[dict[str, Any]], list[tuple[str, str]]]:
    """Split confirmed incidents into those about the locality and those not.

    Returns (kept, [(title, reason), ...]). The rejected list is returned rather
    than discarded so a run can report what it dropped and why — a silent filter
    is how you end up unable to explain your own numbers.

    Two checks: the hand-verified title exclusions, and — when `city` is given —
    the cross-city URL guard that drops same-named coverage from another city.
    """
    kept: list[dict[str, Any]] = []
    dropped: list[tuple[str, str]] = []

    for incident in incidents:
        title = incident.get("title") or ""
        reason = exclusion_reason(title, locality) or city_mismatch_reason(
            incident.get("url") or "", city
        )
        if reason:
            dropped.append((title, reason))
        else:
            kept.append(incident)

    return kept, dropped
