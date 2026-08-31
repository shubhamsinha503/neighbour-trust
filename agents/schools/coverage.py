"""Coverage guard for school counts.

Why this module exists, in one measurement: on 2026-08-17, OpenStreetMap listed
**61** schools within 2 km of Indiranagar, Bengaluru. UDISE, as mirrored on the
India Data Portal, listed **0**. At Jayanagar the split was 76 to 27.

UDISE's Bengaluru records are not merely stale, they are spatially incomplete in
the urban core — plenty of schools are recorded for the district but their
coordinates do not place them where the schools actually are. Gurugram looks far
healthier (90 within 2 km of Sector 14), so this is a per-city defect rather than
a uniform one.

The consequence is that a school *count* derived from UDISE alone cannot be
published as fact. "0 schools within 2 km of Indiranagar" is not a cautious
number or a low-confidence number — it is a wrong number, and a buyer who knows
the area would spot it instantly and discard everything else on the page with it.
docs/strategy.md is explicit that marking "no data available" beats guessing;
this is the same principle applied to a count that looks like data but isn't.

So: below a plausibility floor, the agent reports insufficient coverage instead
of a figure. This is a stopgap that keeps a known-false number off the card. The
real fix is cross-referencing OpenStreetMap for school presence — which
docs/strategy.md already anticipates ("OSM for school locations and walking
distance") and which needs no API key.
"""

from __future__ import annotations

from typing import Optional

# Minimum UDISE schools within 5 km before a count is publishable for an urban
# locality. Not a statistical threshold — a plausibility one. Every launch
# locality is a dense, established urban neighbourhood; any of them genuinely
# having fewer than this many schools within a 5 km radius would be remarkable,
# so a number this low is far likelier to be a coverage hole than a finding.
MIN_SCHOOLS_WITHIN_5KM = 8

# Same idea at the tighter radius: zero schools within 2 km of a dense
# neighbourhood is a defect, not a fact worth printing.
MIN_SCHOOLS_WITHIN_2KM = 1


def coverage_is_publishable(*, within_2km: int, within_5km: int) -> bool:
    return within_5km >= MIN_SCHOOLS_WITHIN_5KM and within_2km >= MIN_SCHOOLS_WITHIN_2KM


def insufficient_coverage_reason(*, within_2km: int, within_5km: int) -> Optional[str]:
    """Explain the gap in words the UI can show verbatim, or None if fine."""
    if coverage_is_publishable(within_2km=within_2km, within_5km=within_5km):
        return None
    return (
        f"UDISE records only {within_5km} school(s) within 5 km of here "
        f"({within_2km} within 2 km), which is implausibly low for this area. "
        "The 2022 UDISE snapshot has known coordinate gaps in Bengaluru's urban "
        "core, so we are not showing a school count rather than showing one we "
        "know to be wrong."
    )
