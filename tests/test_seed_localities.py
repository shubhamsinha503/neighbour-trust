"""Sanity rules for the seeded locality list.

These exist because the failure mode is silent. A duplicate slug, a collision, or
a coordinate in the wrong city all produce a page that renders perfectly and
describes somewhere else — no error, no empty state, nothing a smoke test would
catch. The list is hand-maintained and grows, so the checks run on every commit.
"""

import pytest

from agents.common.geo import cell_for
from agents.common.seed_localities import LOCALITIES

# Generous boxes around each city. Not precision checks — those are
# scripts/geocode_localities.py's job. This only catches a coordinate that has
# landed in the wrong city entirely, usually a transposed lat/lon or a stray digit.
CITY_BOX = {
    "Bengaluru": (12.70, 13.25, 77.30, 77.90),
    "Gurugram": (28.25, 28.60, 76.80, 77.20),
}


def test_slugs_are_unique():
    slugs = [row[0] for row in LOCALITIES]
    duplicates = {s for s in slugs if slugs.count(s) > 1}
    assert not duplicates, f"duplicate slugs: {duplicates}"


def test_no_two_localities_share_an_h3_cell():
    """Two localities in one cell would overwrite each other's envelopes —
    `data_envelope` is keyed by (category, source, h3_cell), so the second seeded
    locality would silently serve the first one's data."""
    seen: dict[str, str] = {}
    for slug, _name, _city, _state, _pin, lat, lon in LOCALITIES:
        cell = cell_for(lat, lon)
        assert cell not in seen, f"{slug} collides with {seen[cell]} in cell {cell}"
        seen[cell] = slug


@pytest.mark.parametrize("row", LOCALITIES, ids=[r[0] for r in LOCALITIES])
def test_coordinates_are_in_the_stated_city(row):
    slug, _name, city, _state, _pin, lat, lon = row
    lat_min, lat_max, lon_min, lon_max = CITY_BOX[city]
    assert lat_min <= lat <= lat_max, f"{slug}: latitude {lat} is outside {city}"
    assert lon_min <= lon <= lon_max, f"{slug}: longitude {lon} is outside {city}"


def test_both_launch_cities_are_represented():
    cities = {row[2] for row in LOCALITIES}
    assert cities == {"Bengaluru", "Gurugram"}


def test_pincodes_look_like_pincodes():
    """A pincode we hold must be a real one. Not holding one is allowed.

    The first forty-four were entered by hand and all had a pincode, so this
    once required one on every row. Localities proposed from OpenStreetMap
    mostly cannot: `addr:postcode` appears on seven place nodes out of eleven
    hundred in Bengaluru.

    The distinction that matters is between absent and wrong. None says we do
    not have it; an empty string sits in the column looking like a pincode we
    hold and merely failed to render, which is the kind of quiet falsehood this
    codebase exists to avoid. The column and the API model are both optional.
    """
    for slug, _name, _city, _state, pincode, _lat, _lon in LOCALITIES:
        if pincode is None:
            continue
        assert pincode != "", f"{slug}: empty pincode should be None, not ''"
        assert pincode.isdigit() and len(pincode) == 6, f"{slug}: bad pincode {pincode!r}"


def test_most_localities_still_carry_a_pincode():
    """A guard against the None path becoming the default by accident.

    If a future import drops pincodes wholesale this should fail rather than
    pass quietly, because a pincode is how a reader confirms we mean the same
    place they do.
    """
    with_pincode = sum(1 for row in LOCALITIES if row[4])
    assert with_pincode >= 40, f"only {with_pincode} localities have a pincode"
