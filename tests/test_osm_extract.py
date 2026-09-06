"""Reading OpenStreetMap from a local extract.

This replaced the Overpass API, which never completed a run: forty-four radius
queries against volunteer-run infrastructure reached 3 of 44 localities, and its
sharpest failure was an overloaded mirror answering HTTP 200 with an HTML error
page — which a JSON parser turns into "this locality has no hospitals".

The tests here pin the two things that decide whether a locality's card is
honest: that every kind of OpenStreetMap object is counted, and that distance
limits are applied per kind.

The relation tests are regression tests. The first version of this reader
handled nodes and ways and silently skipped relations, dropping 114 industrial
sites, 96 parks and 60 hospitals across the two launch regions. Industrial land
is the only signal on this card that *subtracts*, so a missed factory makes a
locality look better than it is — the direction of error that misleads a buyer
rather than merely under-informing them.
"""

import pathlib
import textwrap

import pytest

from agents.infrastructure.sources import osm_extract as osm

# A base point and offsets in degrees. One degree of latitude is ~111 km, so
# 0.009 is roughly a kilometre — near enough for placing fixtures inside and
# outside the two radii.
BASE_LAT, BASE_LON = 12.9352, 77.6245
KM = 1 / 111.0


def write_osm(tmp_path: pathlib.Path, body: str) -> pathlib.Path:
    """A minimal .osm XML file. osmium reads XML as happily as it reads PBF."""
    path = tmp_path / "fixture.osm"
    path.write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<osm version="0.6" generator="test">\n'
        + textwrap.dedent(body)
        + "\n</osm>\n",
        encoding="utf-8",
    )
    return path


def node(nid, dlat=0.0, dlon=0.0, tags=""):
    return (
        f'<node id="{nid}" version="1" '
        f'lat="{BASE_LAT + dlat}" lon="{BASE_LON + dlon}">{tags}</node>'
    )


def tag(k, v):
    return f'<tag k="{k}" v="{v}"/>'


def client_for(path):
    return osm.OsmExtractClient(paths=[path])


class TestEveryObjectKindIsCounted:
    """OpenStreetMap stores the same real thing three different ways."""

    def test_a_tagged_node_is_found(self, tmp_path):
        path = write_osm(tmp_path, node(1, tags=tag("amenity", "hospital")))
        found = client_for(path).around(BASE_LAT, BASE_LON)
        assert found.hospitals == 1
        assert found.nearest_hospital_km == 0.0

    def test_a_way_is_placed_at_the_mean_of_its_nodes(self, tmp_path):
        """A hospital is usually a building outline, not a point."""
        path = write_osm(tmp_path, "\n".join([
            node(1), node(2, dlat=2 * KM),
            '<way id="10" version="1">'
            '<nd ref="1"/><nd ref="2"/>' + tag("amenity", "hospital") + "</way>",
        ]))
        found = client_for(path).around(BASE_LAT, BASE_LON)
        assert found.hospitals == 1
        # Midway between the two nodes: one kilometre up.
        assert found.nearest_hospital_km == pytest.approx(1.0, abs=0.05)

    def test_a_relation_is_resolved_through_its_member_ways(self, tmp_path):
        """The regression test. Skipping relations dropped 114 industrial sites
        across the two launch regions, and industrial land is the one signal
        here that lowers a score."""
        path = write_osm(tmp_path, "\n".join([
            node(1), node(2, dlat=2 * KM),
            '<way id="10" version="1"><nd ref="1"/><nd ref="2"/></way>',
            '<relation id="20" version="1">'
            '<member type="way" ref="10" role="outer"/>'
            + tag("landuse", "industrial") + "</relation>",
        ]))
        found = client_for(path).around(BASE_LAT, BASE_LON)
        assert found.industrial_sites == 1
        assert found.nearest_industry_km == pytest.approx(1.0, abs=0.05)

    def test_a_relation_whose_members_are_absent_is_dropped_not_guessed(self, tmp_path):
        """An extract cut can leave a relation's ways outside the file. Placing
        it at a guessed coordinate would invent a factory somewhere."""
        path = write_osm(tmp_path, "\n".join([
            node(1, tags=tag("amenity", "hospital")),
            '<relation id="20" version="1">'
            '<member type="way" ref="999" role="outer"/>'
            + tag("landuse", "industrial") + "</relation>",
        ]))
        found = client_for(path).around(BASE_LAT, BASE_LON)
        assert found.industrial_sites == 0
        assert found.nearest_industry_km is None


class TestDistanceLimits:
    def test_a_walkable_amenity_beyond_the_radius_is_excluded(self, tmp_path):
        path = write_osm(tmp_path, node(1, dlat=3 * KM, tags=tag("amenity", "hospital")))
        found = client_for(path).around(BASE_LAT, BASE_LON)
        assert found.hospitals == 0

    def test_industrial_land_is_searched_wider_than_amenities(self, tmp_path):
        """A factory does not need to be walkable to put lorries on your road.
        Three kilometres is outside the amenity radius and inside the industrial
        one, so this pins that the two limits are actually different."""
        path = write_osm(tmp_path, node(1, dlat=3 * KM, tags=tag("landuse", "industrial")))
        found = client_for(path).around(BASE_LAT, BASE_LON)
        assert found.industrial_sites == 1
        assert osm.RADIUS_M < 3000 < osm.INDUSTRY_RADIUS_M

    def test_nothing_is_counted_twice_across_kinds(self, tmp_path):
        path = write_osm(tmp_path, node(1, tags=tag("amenity", "clinic")))
        found = client_for(path).around(BASE_LAT, BASE_LON)
        assert found.clinics == 1
        assert found.hospitals == 0


class TestNames:
    def test_names_are_kept_for_the_kinds_the_card_shows(self, tmp_path):
        path = write_osm(tmp_path, node(
            1, tags=tag("railway", "station") + tag("name", "Indiranagar")))
        found = client_for(path).around(BASE_LAT, BASE_LON)
        assert found.names["metro_rail"] == ["Indiranagar"]

    def test_names_are_not_collected_for_kinds_it_does_not_show(self, tmp_path):
        path = write_osm(tmp_path, node(
            1, tags=tag("shop", "supermarket") + tag("name", "A Market")))
        found = client_for(path).around(BASE_LAT, BASE_LON)
        assert "markets" not in found.names

    def test_the_name_list_is_capped(self, tmp_path):
        body = "\n".join(
            node(i, dlat=i * 0.0001,
                 tags=tag("leisure", "park") + tag("name", f"Park {i}"))
            for i in range(1, 8)
        )
        found = client_for(write_osm(tmp_path, body)).around(BASE_LAT, BASE_LON)
        assert found.parks == 7
        assert len(found.names["parks"]) == 4


class TestVintage:
    def test_an_extract_without_a_stamp_reports_none(self, tmp_path):
        """The fixture has no replication timestamp, so this is the honest
        answer rather than a fabricated one."""
        path = write_osm(tmp_path, node(1, tags=tag("amenity", "hospital")))
        assert osm.snapshot_time(path) is None

    def test_a_client_with_no_vintage_does_not_invent_one(self, tmp_path):
        path = write_osm(tmp_path, node(1, tags=tag("amenity", "hospital")))
        assert client_for(path).data_vintage is None


class TestConfiguration:
    def test_an_unknown_extract_name_is_refused_by_name(self, tmp_path):
        with pytest.raises(osm.ExtractError) as exc:
            osm.download_extract("no-such-zone", cache_dir=tmp_path)
        assert "no-such-zone" in str(exc.value)

    def test_both_launch_regions_are_configured(self):
        """Bengaluru sits in the southern zone and Gurugram in the northern one.
        Dropping either silently un-covers a launch city."""
        assert {"southern-zone", "northern-zone"} <= set(osm.EXTRACTS)

    def test_an_empty_extract_raises_rather_than_reporting_an_empty_city(self, tmp_path):
        """The Overpass failure this whole change exists to prevent: a source
        that returns nothing must not read as 'there is nothing here'."""
        path = write_osm(tmp_path, node(1))  # untagged, so nothing matches
        with pytest.raises(osm.ExtractError):
            client_for(path)
