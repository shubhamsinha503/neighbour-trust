"""Tests for the locality-coordinate audit.

The audit is the companion to the news cross-city fix: the news fix stops a
same-name query from pulling another city's coverage; this catches a locality
whose stored point sits in the wrong city, which would corrupt every
coordinate-based category (air, schools, connectivity) silently.
"""

from scripts.audit_locality_coordinates import audit, _box_for


def _loc(slug, city, lat, lon, name=None):
    return {"slug": slug, "name": name or slug, "city": city, "lat": lat, "lon": lon}


class TestBoxLookup:
    def test_known_city_has_a_box(self):
        assert _box_for("Hyderabad") is not None

    def test_lookup_is_case_insensitive(self):
        assert _box_for("hyderabad") == _box_for("Hyderabad")

    def test_unknown_city_has_none(self):
        assert _box_for("Atlantis") is None


class TestAudit:
    def test_locality_inside_its_city_is_fine(self):
        report = audit([_loc("kukatpally", "Hyderabad", 17.49, 78.40)])
        assert report["inside"] == 1 and report["outside"] == []

    def test_the_case_it_exists_for(self):
        """A Hyderabad locality carrying Chennai's coordinates is flagged."""
        report = audit([_loc("anna-nagar", "Hyderabad", 13.085, 80.210)])
        assert report["inside"] == 0
        assert len(report["outside"]) == 1
        assert report["outside"][0]["slug"] == "anna-nagar"

    def test_missing_coordinates_are_reported_not_crashed(self):
        report = audit([_loc("ghost", "Hyderabad", None, None)])
        assert len(report["missing_coords"]) == 1
        assert report["inside"] == 0 and report["outside"] == []

    def test_unknown_city_is_unchecked_not_failed(self):
        report = audit([_loc("somewhere", "Atlantis", 0.0, 0.0)])
        assert report["unchecked_cities"].get("Atlantis") == 1
        assert report["outside"] == []

    def test_counts_add_up(self):
        report = audit(
            [
                _loc("a", "Hyderabad", 17.49, 78.40),   # inside
                _loc("b", "Hyderabad", 13.08, 80.21),   # outside (Chennai)
                _loc("c", "Atlantis", 0.0, 0.0),        # unchecked
                _loc("d", "Hyderabad", None, None),     # no coords
            ]
        )
        assert report["total"] == 4
        assert report["inside"] == 1
        assert len(report["outside"]) == 1
        assert len(report["missing_coords"]) == 1
        assert sum(report["unchecked_cities"].values()) == 1
