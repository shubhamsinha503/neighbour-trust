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
    for slug, _name, _city, _state, pincode, _lat, _lon in LOCALITIES:
        assert pincode.isdigit() and len(pincode) == 6, f"{slug}: bad pincode {pincode!r}"
