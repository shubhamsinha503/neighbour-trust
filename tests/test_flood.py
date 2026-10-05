"""The flood-risk report entry."""

from agents.common import flood_hazard
from agents.orchestrator import flood


class TestBand:
    def test_deep_moderate_shallow(self):
        assert flood.band_for(2.0) == "deep"
        assert flood.band_for(1.0) == "deep"
        assert flood.band_for(0.6) == "moderate"
        assert flood.band_for(0.4) == "moderate"
        assert flood.band_for(0.2) == "shallow"


class TestBuild:
    def test_a_known_flood_zone_is_in_zone_with_depth_and_source(self):
        # Pick any slug the committed table actually holds, so the test tracks
        # the real data rather than a hard-coded name that could be re-sampled out.
        slug = next(iter(flood_hazard.FLOOD_DEPTH_M))
        entry = flood.build(slug)
        assert entry["in_zone"] is True
        assert entry["depth_m"] == flood_hazard.FLOOD_DEPTH_M[slug]
        assert entry["band"] in {"deep", "moderate", "shallow"}
        assert entry["source"] == flood_hazard.SOURCE_NAME
        assert entry["source_url"] == flood_hazard.SOURCE_URL
        assert entry["return_period_years"] == 100

    def test_a_locality_not_in_the_table_is_clear_but_still_attributed(self):
        entry = flood.build("definitely-not-a-real-slug")
        assert entry["in_zone"] is False
        assert entry["depth_m"] is None
        assert entry["band"] is None
        # The source is still named, so a "not in a flood zone" line can cite
        # what it checked against rather than asserting it from nowhere.
        assert entry["source"] == flood_hazard.SOURCE_NAME
