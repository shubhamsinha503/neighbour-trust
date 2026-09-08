"""Proposing new localities from OpenStreetMap place nodes.

Coverage stopped at 44 because every locality past the first eleven was
hand-entered and then independently geocoded, which does not scale. Reading
OSM's own place nodes replaces that — the coordinate is the record rather than a
geocoder's opinion about a name — and it was validated against all 44: 34 agree
within a kilometre, most to within ten metres.

The tests here guard the part that is not about coordinates at all. A proposal
carries a name, a city and a state onto a public page, and getting the city
wrong is a worse error than getting the position slightly wrong: it is
confidently, legibly false.
"""

import pytest

from scripts import propose_localities as prop


def place(name, lat, lon, kind="suburb"):
    return {"name": name, "kind": kind, "lat": lat, "lon": lon,
            "pincode": None, "wikidata": None}


# Roughly true positions, enough to reason about which is nearer.
GURUGRAM = place("Gurugram", 28.4595, 77.0266, "city")
NEW_DELHI = place("New Delhi", 28.6139, 77.2090, "city")
BENGALURU = place("Bengaluru", 12.9716, 77.5946, "city")
SETTLEMENTS = [GURUGRAM, NEW_DELHI, BENGALURU]


class TestWhichCityAPlaceBelongsTo:
    """The regression that matters most.

    The first version took every place node within 20 km of Gurugram's centre.
    South-west Delhi is inside that radius and is mapped more densely than
    Gurugram, so the proposal was topped by Saket, Hauz Khas, Malviya Nagar and
    Dwarka — offered as localities of "Gurugram, Haryana". Wrong city and wrong
    state, ranked first, on a product whose entire claim is accuracy.
    """

    def test_a_gurugram_sector_is_attributed_to_gurugram(self):
        sector_51 = place("Sector 51", 28.4290, 77.0640)
        home = prop.nearest_settlement(sector_51["lat"], sector_51["lon"], SETTLEMENTS)
        assert home is not None and home["name"] == "Gurugram"

    def test_saket_is_attributed_to_delhi_not_gurugram(self):
        saket = place("Saket", 28.5245, 77.2066)
        home = prop.nearest_settlement(saket["lat"], saket["lon"], SETTLEMENTS)
        assert home is not None and home["name"] == "New Delhi"

    def test_a_place_with_no_settlement_near_enough_is_unattributed(self):
        """Better to propose nothing than to attach a name to the wrong city."""
        middle_of_nowhere = place("Somewhere", 20.0, 70.0)
        assert prop.nearest_settlement(
            middle_of_nowhere["lat"], middle_of_nowhere["lon"], SETTLEMENTS
        ) is None

    def test_villages_are_not_used_to_attribute(self):
        """Gurugram district holds dozens of villages. Counting them meant a
        sector a kilometre from Samaspur was attributed to Samaspur, which
        rejected 90 real Gurugram neighbourhoods."""
        assert "village" not in prop.SETTLEMENT_KINDS
        assert set(prop.SETTLEMENT_KINDS) == {"city", "town"}

    def test_the_settlement_cutoff_is_finite(self):
        """An unbounded nearest-match would attribute a place to a city
        hundreds of kilometres away rather than declining."""
        assert 0 < prop.MAX_SETTLEMENT_KM <= 50


class TestCityNaming:
    def test_both_spellings_of_each_city_are_accepted(self):
        """OSM carries the pre-2014 names, and older data still uses them.
        Without the aliases every Bengaluru candidate would be rejected as
        belonging to 'Bangalore'."""
        assert "Bangalore" in prop.CITIES["Bengaluru"]["aliases"]
        assert "Gurgaon" in prop.CITIES["Gurugram"]["aliases"]

    def test_manesar_counts_as_gurugram(self):
        """It is tagged place=city and is a municipal town, but it is already in
        the seed list as a Gurugram locality and a buyer searching it means
        Gurugram."""
        assert "Manesar" in prop.CITIES["Gurugram"]["aliases"]

    def test_electronic_city_counts_as_bengaluru(self):
        """Same shape as Manesar, and it cost 18 localities. Electronic City is
        tagged place=town and is its own municipal council, so every layout
        around it was attributed there and refused — while Electronic City
        itself sits in the seed list as a Bengaluru locality. Adding it took the
        Bengaluru proposal from 40 accepted to 55.
        """
        assert "Electronic City" in prop.CITIES["Bengaluru"]["aliases"]

    def test_a_town_that_is_genuinely_elsewhere_is_not_aliased(self):
        """The alias list is for places the product already treats as part of
        the city, not a way to widen the net. Hoskote, Nelamangala, Bidadi and
        Devanahalli are separate towns, and their neighbourhoods are correctly
        refused rather than relabelled as Bengaluru."""
        aliases = {a.lower() for a in prop.CITIES["Bengaluru"]["aliases"]}
        for elsewhere in ("hoskote", "nelamangala", "bidadi", "devanahalli",
                          "sarjapura", "jigani"):
            assert elsewhere not in aliases

    def test_each_city_declares_the_state_that_goes_on_the_page(self):
        assert prop.CITIES["Bengaluru"]["state"] == "Karnataka"
        assert prop.CITIES["Gurugram"]["state"] == "Haryana"


class TestNamesThatAreNotNeighbourhoods:
    @pytest.mark.parametrize("name", [
        "Commercial Street Market",
        "Majestic Bus Stand",
        "Cantonment Railway Station",
        "Indiranagar Metro",
        "Silk Board Junction",
    ])
    def test_landmarks_are_rejected(self, name):
        assert prop.NAME_NOISE.search(name)

    @pytest.mark.parametrize("name", [
        "Indiranagar", "Sector 51", "Shivaji Nagar", "New Colony", "Hoodi",
    ])
    def test_real_neighbourhoods_are_not(self, name):
        assert not prop.NAME_NOISE.search(name)


class TestSlugs:
    def test_slug_is_kebab_case(self):
        assert prop.slugify("Sector 23A") == "sector-23a"
        assert prop.slugify("Raj Nagar") == "raj-nagar"

    def test_punctuation_does_not_survive(self):
        assert prop.slugify("D'Souza Layout") == "d-souza-layout"
        assert prop.slugify("Sector 15-I") == "sector-15-i"

    def test_ampersand_becomes_a_word(self):
        assert prop.slugify("Ram & Shyam Nagar") == "ram-and-shyam-nagar"

    def test_no_leading_or_trailing_separator(self):
        slug = prop.slugify("  Sector 9A  ")
        assert not slug.startswith("-") and not slug.endswith("-")


class TestAdmissionThresholds:
    def test_a_candidate_must_have_something_to_show(self):
        """A locality that renders an empty report is worse than one that does
        not exist: it invites a search and answers nothing."""
        assert prop.MIN_SCHOOLS > 0
        assert prop.MIN_AMENITIES > 0

    def test_the_bar_stays_low_because_the_product_reports_its_own_coverage(self):
        """Thin is honest here — the card says "2 of 5 categories". The bar
        exists to exclude empty, not to exclude partial."""
        assert prop.MIN_SCHOOLS <= 5
        assert prop.MIN_AMENITIES <= 15

    def test_an_existing_locality_is_not_proposed_again(self):
        assert prop.ALREADY_COVERED_KM > 0

    def test_the_seed_file_is_readable_and_already_populated(self):
        existing = prop.existing_localities()
        assert len(existing) >= 44
        slugs = [e[0] for e in existing]
        assert "indiranagar" in slugs
        assert len(slugs) == len(set(slugs)), "seed file has duplicate slugs"


class TestSeedRowFormatting:
    def test_a_row_matches_the_seed_file_shape(self):
        result = {
            "city": "Gurugram",
            "state": "Haryana",
            "accepted": [{
                "slug": "sector-51", "name": "Sector 51",
                "lat": 28.4290, "lon": 77.0640, "pincode": None,
            }],
        }
        row = prop.as_seed_rows(result, None).strip()
        assert row == '("sector-51", "Sector 51", "Gurugram", "Haryana", "", 28.4290, 77.0640),'

    def test_a_known_pincode_is_carried_through(self):
        result = {
            "city": "Gurugram", "state": "Haryana",
            "accepted": [{"slug": "x", "name": "X", "lat": 1.0, "lon": 2.0,
                          "pincode": "122001"}],
        }
        assert '"122001"' in prop.as_seed_rows(result, None)
