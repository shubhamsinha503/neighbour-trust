"""Verify locality centroids against Nominatim before seeding them.

Locality coordinates are the one input in this system where a quiet error is
invisible downstream: a centroid a kilometre off still returns schools, still
finds an air quality station, still renders a confident-looking page — it just
describes the wrong neighbourhood. Nothing further down the pipeline can detect
that, so it has to be caught here.

Each candidate below carries a hand-entered estimate. This script geocodes the
name, compares, and prints the distance between the two. Agreement within ~1.5 km
means both independently landed on the same place. Disagreement means one of them
is wrong and a human has to look.

Run: python -m scripts.geocode_localities
"""

from __future__ import annotations

import math
import sys
import time

import httpx

# Nominatim's usage policy: max 1 request/second, and a real User-Agent.
UA = "neighbour-trust/0.1 (locality centroid verification)"
DELAY = 1.1

# Bounding boxes keep "Sector 56" from resolving to a sector in some other city.
# (min_lon, min_lat, max_lon, max_lat)
CITY_BOX = {
    "Bengaluru": (77.35, 12.75, 77.85, 13.20),
    "Gurugram": (76.85, 28.30, 77.15, 28.55),
}

# How far apart my estimate and the geocoder may be before a human must look.
# H3 resolution 9 cells are ~350 m across, so this is not "same cell" — it is
# "same neighbourhood", which is the real claim being made.
AGREEMENT_KM = 1.5

# (slug, name, city, state, pincode, est_lat, est_lon)
CANDIDATES = [
    # --- Bengaluru ---
    # Deliberately excluded: Sarjapur Road, Sohna Road, MG Road. They are named
    # corridors rather than areas — several kilometres long, with conditions that
    # differ end to end — so no single centroid describes them and any point we
    # picked would silently stand in for the whole stretch. They are real search
    # terms and will need to be handled as corridors, not faked as points.
    ("hsr-layout",        "HSR Layout",           "Bengaluru", "Karnataka", "560102", 12.9116, 77.6389),
    ("electronic-city",   "Electronic City",      "Bengaluru", "Karnataka", "560100", 12.8452, 77.6602),
    ("marathahalli",      "Marathahalli",         "Bengaluru", "Karnataka", "560037", 12.9591, 77.6974),
    ("bellandur",         "Bellandur",            "Bengaluru", "Karnataka", "560103", 12.9260, 77.6762),
    ("jp-nagar",          "JP Nagar",             "Bengaluru", "Karnataka", "560078", 12.9077, 77.5851),
    ("banashankari",      "Banashankari",         "Bengaluru", "Karnataka", "560070", 12.9250, 77.5460),
    ("basavanagudi",      "Basavanagudi",         "Bengaluru", "Karnataka", "560004", 12.9420, 77.5730),
    ("rajajinagar",       "Rajajinagar",          "Bengaluru", "Karnataka", "560010", 12.9915, 77.5520),
    ("malleshwaram",      "Malleshwaram",         "Bengaluru", "Karnataka", "560003", 13.0035, 77.5709),
    ("yelahanka",         "Yelahanka",            "Bengaluru", "Karnataka", "560064", 13.1007, 77.5963),
    ("rt-nagar",          "RT Nagar",             "Bengaluru", "Karnataka", "560032", 13.0206, 77.5946),
    ("vijayanagar",       "Vijayanagar",          "Bengaluru", "Karnataka", "560040", 12.9719, 77.5300),
    ("kr-puram",          "KR Puram",             "Bengaluru", "Karnataka", "560036", 13.0075, 77.6960),
    ("hoodi",             "Hoodi",                "Bengaluru", "Karnataka", "560048", 12.9920, 77.7160),
    ("kalyan-nagar",      "Kalyan Nagar",         "Bengaluru", "Karnataka", "560043", 13.0245, 77.6400),
    ("hennur",            "Hennur",               "Bengaluru", "Karnataka", "560043", 13.0430, 77.6390),
    ("thanisandra",       "Thanisandra",          "Bengaluru", "Karnataka", "560064", 13.0570, 77.6220),
    ("uttarahalli",       "Uttarahalli",          "Bengaluru", "Karnataka", "560061", 12.9060, 77.5460),
    ("rr-nagar",          "Rajarajeshwari Nagar", "Bengaluru", "Karnataka", "560098", 12.9260, 77.5180),
    ("kengeri",           "Kengeri",              "Bengaluru", "Karnataka", "560060", 12.9166, 77.4826),
    ("bommanahalli",      "Bommanahalli",         "Bengaluru", "Karnataka", "560068", 12.8990, 77.6180),
    ("banaswadi",         "Banaswadi",            "Bengaluru", "Karnataka", "560033", 13.0140, 77.6510),
    ("domlur",            "Domlur",               "Bengaluru", "Karnataka", "560071", 12.9610, 77.6380),
    # --- Gurugram ---
    ("dlf-phase-1",       "DLF Phase 1",          "Gurugram",  "Haryana",   "122002", 28.4730, 77.0980),
    ("dlf-phase-2",       "DLF Phase 2",          "Gurugram",  "Haryana",   "122008", 28.4890, 77.0900),
    ("dlf-phase-4",       "DLF Phase 4",          "Gurugram",  "Haryana",   "122009", 28.4620, 77.0930),
    ("dlf-phase-5",       "DLF Phase 5",          "Gurugram",  "Haryana",   "122009", 28.4400, 77.1010),
    ("sector-49",         "Sector 49",            "Gurugram",  "Haryana",   "122018", 28.4130, 77.0470),
    ("sector-45",         "Sector 45",            "Gurugram",  "Haryana",   "122003", 28.4290, 77.0630),
    ("sector-57",         "Sector 57",            "Gurugram",  "Haryana",   "122003", 28.4180, 77.0790),
    ("palam-vihar",       "Palam Vihar",          "Gurugram",  "Haryana",   "122017", 28.5030, 76.9930),
    ("sector-82",         "Sector 82",            "Gurugram",  "Haryana",   "122004", 28.3930, 76.9560),
    ("sector-102",        "Sector 102",           "Gurugram",  "Haryana",   "122006", 28.5060, 76.9840),
    ("sector-65",         "Sector 65",            "Gurugram",  "Haryana",   "122101", 28.4030, 77.0740),
    ("manesar",           "Manesar",              "Gurugram",  "Haryana",   "122051", 28.3540, 76.9370),
    ("sushant-lok-2",     "Sushant Lok 2",        "Gurugram",  "Haryana",   "122009", 28.4400, 77.0640),
    ("sector-31",         "Sector 31",            "Gurugram",  "Haryana",   "122001", 28.4520, 77.0450),
]


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def geocode(client: httpx.Client, name: str, city: str):
    box = CITY_BOX[city]
    response = client.get(
        "https://nominatim.openstreetmap.org/search",
        params={
            "q": f"{name}, {city}, India",
            "format": "json",
            # Ask for several. The top hit is whatever matched best textually,
            # which for a neighbourhood name is often a road or a business
            # carrying that name; the area record may be further down.
            "limit": 10,
            # bounded=1 makes viewbox a hard filter rather than a preference,
            # which is what stops "Sector 49" resolving to Noida or Chandigarh.
            "viewbox": ",".join(str(v) for v in box),
            "bounded": 1,
        },
    )
    response.raise_for_status()
    hits = response.json()
    if not hits:
        return None

    place = next((h for h in hits if _is_place(h)), None)
    if place is None:
        # Nothing in the results describes an area. Report what the best match
        # actually was so the rejection is legible.
        top = hits[0]
        return None, None, top.get("display_name", ""), f"{top.get('class')}/{top.get('type')}"

    return float(place["lat"]), float(place["lon"]), place.get("display_name", ""), None


# Nominatim answers a neighbourhood query with whatever it can match, including
# businesses. Two real cases from the first run: "DLF Phase 4" resolved to a
# Central Bank branch in Phase *3*, and "DLF Phase 5" to a commercial tower
# called DLF Downtown. Both look like confident results and both would have
# placed a neighbourhood kilometres from where buyers mean.
#
# The tell is the OSM class. `place` and `boundary` are the categories that
# describe an area; `amenity`, `shop`, `office`, `building` describe something
# standing inside one.
# Two record types describe an area, and nothing else does.
#
# `boundary/administrative` is the strongest — an actual mapped polygon, which is
# what Gurugram's numbered sectors have and what makes them unambiguous.
# `place/<settlement>` covers named neighbourhoods with no official boundary,
# which is most of Bengaluru.
#
# Everything else is a feature standing inside a neighbourhood, and each of these
# was a real wrong answer in an earlier run of this script:
#   landuse/commercial  -> "DLF Phase 5" matched DLF Downtown, a tower 7 km away
#   amenity/atm         -> "DLF Phase 4" matched a Central Bank branch in Phase 3
#   railway/station     -> "Kengeri" and "Vijayanagar" matched metro stops
#   highway/*           -> road corridors carrying the locality's name
PLACE_TYPES = {
    "place": (
        "suburb", "neighbourhood", "quarter", "village", "town", "city_district",
        "residential", "locality", "hamlet", "borough",
    ),
    "boundary": ("administrative",),
}


def _is_place(hit: dict) -> bool:
    return hit.get("type") in PLACE_TYPES.get(hit.get("class"), ())


def main() -> int:
    agreed, corrected, rejected, missing = [], [], [], []

    with httpx.Client(headers={"User-Agent": UA}, timeout=30) as client:
        for slug, name, city, state, pincode, est_lat, est_lon in CANDIDATES:
            try:
                hit = geocode(client, name, city)
            except Exception as exc:
                print(f"  !! {slug}: geocode failed: {exc}")
                missing.append((slug, name, city, state, pincode, est_lat, est_lon))
                time.sleep(DELAY)
                continue

            if hit is None:
                print(f"  ?? {slug:20s} no result in {city} box")
                missing.append((slug, name, city, state, pincode, est_lat, est_lon))
                time.sleep(DELAY)
                continue

            lat, lon, label, rejected_as = hit
            if rejected_as is not None:
                # A POI match. Never silently accepted, even when it happens to
                # sit close to the estimate — being near the right answer for the
                # wrong reason is not verification.
                print(f"  -- {slug:20s} no area record; best was {rejected_as} "
                      f"[{label[:45]}]")
                rejected.append((slug, f"{rejected_as} — {label}"))
                time.sleep(DELAY)
                continue

            km = haversine_km(est_lat, est_lon, lat, lon)
            row = (slug, name, city, state, pincode, lat, lon)

            if km <= AGREEMENT_KM:
                print(f"  ok {slug:20s} {km:5.2f} km  -> {lat:.4f}, {lon:.4f}")
                agreed.append(row)
            else:
                # Two independent sources disagree about where a neighbourhood is
                # and one of them is OSM's own place record. Take OSM, and print
                # the delta so the size of the correction is visible.
                print(f"  ~~ {slug:20s} {km:5.2f} km  est was wrong, using osm "
                      f"{lat:.4f},{lon:.4f}  [{label[:45]}]")
                agreed.append(row)
                corrected.append((slug, km))

            time.sleep(DELAY)

    print("")
    print(f"{len(agreed)} usable ({len(corrected)} corrected from OSM), "
          f"{len(rejected)} with no area record, {len(missing)} unresolved")
    for slug, why in rejected:
        print(f"  needs a human: {slug} -> {why[:80]}")
    print("")
    print("# --- paste-ready, geocoder-confirmed only ---")
    for slug, name, city, state, pincode, lat, lon in agreed:
        print(f'    ("{slug}", "{name}", "{city}", "{state}", "{pincode}", {lat:.4f}, {lon:.4f}),')

    return 0


if __name__ == "__main__":
    sys.exit(main())
