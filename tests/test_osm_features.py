"""One read of an OpenStreetMap extract, shared by every agent that needs it.

The connectivity agent and the schools agent both want features out of the same
two regional files, and each was parsing 750 MB for itself. The cost is not
finding the features but placing them: two of the three passes scan the whole
file, and their cost barely moves with how much is asked for. Three minutes to
resolve 222 relation members is three minutes whether or not you also wanted
schools.

So these tests pin the two properties that make sharing safe. Every consumer's
selectors survive one pass, and a cache is only reused when it describes the
same snapshot — a cache keyed loosely would serve last month's map as this
week's, which is the failure this codebase treats as worse than no data.
"""

import gzip
import json
import pathlib
import textwrap

import pytest

from agents.common import osm_features as osm

BASE_LAT, BASE_LON = 12.9352, 77.6245
KM = 1 / 111.0


def write_osm(tmp_path: pathlib.Path, body: str) -> pathlib.Path:
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


class TestOnePassServesEveryConsumer:
    def test_schools_and_amenities_come_out_of_the_same_read(self, tmp_path):
        """The whole point. If one consumer's selectors were dropped, that agent
        would silently see an empty region rather than an error."""
        path = write_osm(tmp_path, "\n".join([
            node(1, tags=tag("amenity", "school") + tag("name", "A School")),
            node(2, dlat=KM, tags=tag("amenity", "hospital")),
            node(3, dlat=2 * KM, tags=tag("leisure", "park")),
            node(4, dlat=3 * KM, tags=tag("landuse", "industrial")),
        ]))
        features = osm.parse_extract(path)
        kinds = {
            f.tags.get("amenity") or f.tags.get("leisure") or f.tags.get("landuse")
            for f in features
        }
        assert {"school", "hospital", "park", "industrial"} <= kinds

    def test_every_selector_a_consumer_relies_on_is_declared(self):
        """Adding a consumer means adding its pairs here, not adding a second
        read of the file."""
        pairs = set(osm.SELECTORS)
        assert ("amenity", "school") in pairs          # schools agent
        assert ("landuse", "industrial") in pairs      # connectivity's one penalty
        assert ("railway", "station") in pairs
        assert ("amenity", "hospital") in pairs

    def test_tags_the_agents_read_survive_the_trim(self, tmp_path):
        """Only some tags are carried into the cache. Dropping one an agent
        reads would blank a field rather than fail loudly."""
        path = write_osm(tmp_path, node(1, tags=(
            tag("amenity", "school")
            + tag("name", "St Example")
            + tag("operator:type", "private")
            + tag("addr:postcode", "560034")
            + tag("tourism", "hotel")  # not read by anyone; should be dropped
        )))
        feature = osm.parse_extract(path)[0]
        assert feature.tags["name"] == "St Example"
        assert feature.tags["operator:type"] == "private"
        assert feature.tags["addr:postcode"] == "560034"
        assert "tourism" not in feature.tags

    def test_a_way_is_placed_at_the_mean_of_its_nodes(self, tmp_path):
        """Schools and hospitals are usually building outlines, not points."""
        path = write_osm(tmp_path, "\n".join([
            node(1), node(2, dlat=2 * KM),
            '<way id="10" version="1"><nd ref="1"/><nd ref="2"/>'
            + tag("amenity", "school") + "</way>",
        ]))
        feature = osm.parse_extract(path)[0]
        assert feature.osm_type == "way"
        assert feature.lat == pytest.approx(BASE_LAT + KM, abs=1e-4)

    def test_a_relation_is_resolved_through_its_member_ways(self, tmp_path):
        """Campus multipolygons. Skipping relations once dropped 114 industrial
        sites across the two launch regions."""
        path = write_osm(tmp_path, "\n".join([
            node(1), node(2, dlat=2 * KM),
            '<way id="10" version="1"><nd ref="1"/><nd ref="2"/></way>',
            '<relation id="20" version="1">'
            '<member type="way" ref="10" role="outer"/>'
            + tag("amenity", "school") + "</relation>",
        ]))
        feature = osm.parse_extract(path)[0]
        assert feature.osm_type == "relation"
        assert feature.external_id == "relation/20"

    def test_a_feature_whose_nodes_are_absent_is_dropped_not_guessed(self, tmp_path):
        path = write_osm(tmp_path, "\n".join([
            node(1, tags=tag("amenity", "hospital")),
            '<relation id="20" version="1">'
            '<member type="way" ref="999" role="outer"/>'
            + tag("landuse", "industrial") + "</relation>",
        ]))
        features = osm.parse_extract(path)
        assert len(features) == 1
        assert features[0].tags.get("amenity") == "hospital"


class TestTheCacheCannotServeTheWrongMap:
    def test_a_cache_from_another_snapshot_is_not_reused(self, tmp_path):
        """The dangerous case: a cache keyed only by name would hand last
        month's map to a run that had just downloaded a fresh extract."""
        cache = tmp_path / "southern-zone.features.jsonl.gz"
        with gzip.open(cache, "wt", encoding="utf-8") as handle:
            handle.write(json.dumps({
                "version": osm.CACHE_VERSION,
                "vintage": "2020-01-01T00:00:00+00:00",
                "count": 1,
            }) + "\n")
            handle.write(json.dumps(["node", 1, 12.9, 77.6, {"amenity": "school"}]) + "\n")

        from datetime import datetime, timezone
        newer = datetime(2026, 9, 8, tzinfo=timezone.utc)
        assert osm._load_cache(cache, newer) is None

    def test_a_cache_from_the_same_snapshot_is_reused(self, tmp_path):
        from datetime import datetime, timezone

        vintage = datetime(2026, 9, 8, tzinfo=timezone.utc)
        cache = tmp_path / "x.features.jsonl.gz"
        osm._save_cache(cache, [osm.Feature("node", 1, 12.9, 77.6, {"amenity": "school"})],
                        vintage)
        loaded = osm._load_cache(cache, vintage)
        assert loaded is not None
        assert loaded[0].external_id == "node/1"
        assert loaded[0].tags["amenity"] == "school"

    def test_an_old_cache_format_is_rebuilt_rather_than_misread(self, tmp_path):
        from datetime import datetime, timezone

        vintage = datetime(2026, 9, 8, tzinfo=timezone.utc)
        cache = tmp_path / "x.features.jsonl.gz"
        with gzip.open(cache, "wt", encoding="utf-8") as handle:
            handle.write(json.dumps({
                "version": osm.CACHE_VERSION + 1,
                "vintage": vintage.isoformat(),
            }) + "\n")
        assert osm._load_cache(cache, vintage) is None

    def test_an_empty_cache_is_never_served(self, tmp_path):
        """An empty result is indistinguishable from a region with nothing in
        it, and conflating those is the failure this whole codebase is built to
        avoid — an Overpass mirror carrying only Switzerland answered a query
        about Bengaluru in 3.3 seconds with zero results."""
        from datetime import datetime, timezone

        vintage = datetime(2026, 9, 8, tzinfo=timezone.utc)
        cache = tmp_path / "x.features.jsonl.gz"
        osm._save_cache(cache, [], vintage)
        assert osm._load_cache(cache, vintage) is None

    def test_a_corrupt_cache_is_ignored_rather_than_raising(self, tmp_path):
        cache = tmp_path / "x.features.jsonl.gz"
        cache.write_bytes(b"this is not gzip")
        from datetime import datetime, timezone
        assert osm._load_cache(cache, datetime(2026, 9, 8, tzinfo=timezone.utc)) is None


class TestConfiguration:
    def test_an_unknown_extract_is_refused_by_name(self, tmp_path):
        with pytest.raises(osm.ExtractError) as exc:
            osm.download_extract("no-such-zone", cache_dir=tmp_path)
        assert "no-such-zone" in str(exc.value)

    def test_both_launch_regions_are_configured(self):
        assert {"southern-zone", "northern-zone"} <= set(osm.EXTRACTS)
