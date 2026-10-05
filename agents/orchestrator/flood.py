"""The flood-risk entry for a locality report.

Reads the committed, static hazard table (agents/common/flood_hazard.py, which
scripts/sample_flood_hazard regenerates) and shapes it for the report. Kept
apart from that generated file so this logic survives a regeneration, and apart
from scoring because flood is never a 0-100 score: a modeled hazard depth is a
fact to show and link, not a number to average into the Trust Score. Press-style
distortion does not apply, but the "never invent, always attribute" rule does —
every field here carries its source and the fact that it is modeled.
"""

from __future__ import annotations

from typing import Any, Optional

from agents.common import flood_hazard as data

# Depth bands, in metres. Chosen to read plainly to a buyer, not to imply the
# model is precise: "ankle/knee-deep" is the honest granularity of a ~1 km grid.
DEEP_M = 1.0       # waist-deep or more
MODERATE_M = 0.4   # knee-deep


def band_for(depth: float) -> str:
    if depth >= DEEP_M:
        return "deep"
    if depth >= MODERATE_M:
        return "moderate"
    return "shallow"


def build(slug: str) -> dict[str, Any]:
    """Always returns an entry, so a report can state "not in a flood zone" as
    plainly as it states that it is. `in_zone` is False when the model shows no
    meaningful depth within ~1 km of the locality."""
    depth: Optional[float] = data.FLOOD_DEPTH_M.get(slug)
    in_zone = depth is not None
    return {
        "in_zone": in_zone,
        "depth_m": depth,
        "band": band_for(depth) if in_zone else None,
        "return_period_years": data.RETURN_PERIOD_YEARS,
        "source": data.SOURCE_NAME,
        "source_url": data.SOURCE_URL,
        "vintage": data.DATA_VINTAGE,
    }
