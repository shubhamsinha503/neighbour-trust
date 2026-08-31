"""The UDISE proxy score.

docs/strategy.md is blunt that UDISE "isn't a quality score" and that any score
has to be constructed from pupil-teacher ratio, board pass rates and
infrastructure fields. Two of those three are available; board pass rates are not
in the dataset at all. So this is a **capacity** score, not a quality score, and
the naming and the UI copy both say so.

What it deliberately does NOT do:

  * **Rank schools against each other as "better".** A 12:1 pupil-teacher ratio
    at a 40-pupil rural school and at a 900-pupil city school mean very different
    things, and neither tells you whether the teaching is good.
  * **Penalise small schools.** Raw counts (more teachers, more classrooms) would
    just rank by size. Everything here is a ratio.
  * **Fill gaps with averages.** A school with no teacher count scores None and
    is excluded from medians, rather than being handed a district mean that would
    make missing data look like measured data.

Benchmarks come from the Right to Education Act's own norms, so the numbers are
defensible to a user who asks where they came from rather than being invented.
"""

from __future__ import annotations

from statistics import median
from typing import Optional

# RTE Act, Schedule: 30:1 at primary, 35:1 at upper primary. 30 is used as the
# "meets the legal norm" line and 20 as the point where more teachers stops
# meaningfully changing the picture.
PTR_EXCELLENT = 20.0
PTR_RTE_NORM = 30.0
PTR_POOR = 60.0

# Students per classroom. RTE asks for one classroom per teacher; 30 per room is
# the practical equivalent and 60+ means genuine crowding.
SPR_EXCELLENT = 20.0
SPR_ACCEPTABLE = 35.0
SPR_POOR = 70.0

# The score is 60% staffing, 40% space: a crowded room with enough teachers is a
# meaningfully better place to learn than an empty room with too few.
PTR_WEIGHT = 0.6
SPR_WEIGHT = 0.4


def _band_score(value: float, best: float, acceptable: float, worst: float) -> float:
    """Map a lower-is-better ratio onto 0-100, linear between the anchors."""
    if value <= best:
        return 100.0
    if value >= worst:
        return 0.0
    if value <= acceptable:
        # 100 down to 60 across the "at or better than norm" range.
        return 100.0 - 40.0 * (value - best) / (acceptable - best)
    # 60 down to 0 across the "worse than norm" range.
    return 60.0 - 60.0 * (value - acceptable) / (worst - acceptable)


def pupil_teacher_ratio(students: Optional[int], teachers: Optional[int]) -> Optional[float]:
    """PTR, or None when it cannot be computed honestly.

    Zero teachers is treated as unknown rather than as an infinitely bad ratio:
    UDISE genuinely contains rows with 0 teachers, and those are far more often a
    data-entry gap than a school operating without staff.
    """
    if not students or not teachers or students <= 0 or teachers <= 0:
        return None
    return round(students / teachers, 1)


def students_per_room(students: Optional[int], class_rooms: Optional[int]) -> Optional[float]:
    if not students or not class_rooms or students <= 0 or class_rooms <= 0:
        return None
    return round(students / class_rooms, 1)


def proxy_score(ptr: Optional[float], spr: Optional[float]) -> Optional[float]:
    """0-100 capacity score. None when neither component is available.

    When only one component exists the score uses it alone rather than assuming a
    neutral value for the other — a guessed 50 would be indistinguishable from a
    measured 50 in the output.
    """
    ptr_score = _band_score(ptr, PTR_EXCELLENT, PTR_RTE_NORM, PTR_POOR) if ptr else None
    spr_score = _band_score(spr, SPR_EXCELLENT, SPR_ACCEPTABLE, SPR_POOR) if spr else None

    if ptr_score is None and spr_score is None:
        return None
    if spr_score is None:
        return round(ptr_score, 1)
    if ptr_score is None:
        return round(spr_score, 1)

    return round(ptr_score * PTR_WEIGHT + spr_score * SPR_WEIGHT, 1)


def infra_score(spr: Optional[float], other_rooms: Optional[int]) -> Optional[float]:
    """The `infra_score` field of SchoolsPayload — classroom adequacy only.

    UDISE's richer infrastructure fields (toilets, electricity, drinking water,
    library, playground) exist in the full UDISE+ release but not in this
    resource, so this is narrower than the strategy doc envisaged. Kept separate
    from proxy_score so that a later, richer infrastructure source improves this
    field without silently changing the headline score's meaning.
    """
    if spr is None:
        return None
    score = _band_score(spr, SPR_EXCELLENT, SPR_ACCEPTABLE, SPR_POOR)
    # Non-teaching rooms (library, lab, office) are a weak positive signal.
    if other_rooms and other_rooms > 0:
        score = min(100.0, score + 5.0)
    return round(score, 1)


def median_or_none(values: list[Optional[float]]) -> Optional[float]:
    present = [v for v in values if v is not None]
    return round(median(present), 1) if present else None
