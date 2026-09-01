"""Seed the launch localities for Bengaluru and Gurugram.

Not a bulk import. Locality boundaries in India are informal and contested; these
are centroids of areas a buyer would actually name when searching, which is the
unit the product is about. Growing this list is cheap — getting it wrong is the
sort of error that silently attributes one neighbourhood's air to another, and
nothing downstream can detect it: a centroid a kilometre off still returns
schools, still finds a station, still renders a confident page.

So every coordinate below the first eleven was checked twice — hand-entered from
knowledge, then geocoded independently, and only kept where the two agreed or
where OpenStreetMap held an actual area record for the name. That check is
`scripts/geocode_localities.py` and it is worth re-running when adding more; it
caught "DLF Phase 5" resolving to a commercial tower 7 km away and "Kengeri"
resolving to a metro stop.

Three names it could not resolve, left out rather than guessed:

  - **Vijayanagar** — only a metro stop carries the name in OSM.
  - **DLF Phase 4 / Phase 5** — no area record; the best matches were a bank
    branch in Phase 3 and the DLF Downtown office complex.

Also deliberately absent: Sarjapur Road, Sohna Road, MG Road. Those are corridors
several kilometres long whose conditions differ end to end, so no single centroid
describes them. They are real search terms and need corridor handling, not a
point pretending to be one.

Run: python -m agents.common.seed_localities
"""

from __future__ import annotations

from agents.common import db
from agents.common.geo import cell_for

# (slug, name, city, state, pincode, lat, lon)
LOCALITIES: list[tuple[str, str, str, str, str, float, float]] = [
    # --- Bengaluru, Karnataka ---
    ("indiranagar",      "Indiranagar",       "Bengaluru", "Karnataka", "560038", 12.9784, 77.6408),
    ("koramangala",      "Koramangala",       "Bengaluru", "Karnataka", "560034", 12.9352, 77.6245),
    ("jayanagar",        "Jayanagar",         "Bengaluru", "Karnataka", "560041", 12.9250, 77.5938),
    ("whitefield",       "Whitefield",        "Bengaluru", "Karnataka", "560066", 12.9698, 77.7500),
    ("hebbal",           "Hebbal",            "Bengaluru", "Karnataka", "560024", 13.0358, 77.5970),
    ("btm-layout",       "BTM Layout",        "Bengaluru", "Karnataka", "560076", 12.9166, 77.6101),
    ("hsr-layout", "HSR Layout", "Bengaluru", "Karnataka", "560102", 12.9116, 77.6389),
    ("electronic-city", "Electronic City", "Bengaluru", "Karnataka", "560100", 12.8436, 77.6687),
    ("marathahalli", "Marathahalli", "Bengaluru", "Karnataka", "560037", 12.9553, 77.6984),
    ("bellandur", "Bellandur", "Bengaluru", "Karnataka", "560103", 12.9320, 77.6843),
    ("jp-nagar", "JP Nagar", "Bengaluru", "Karnataka", "560078", 12.9097, 77.5866),
    ("banashankari", "Banashankari", "Bengaluru", "Karnataka", "560070", 12.9278, 77.5566),
    ("basavanagudi", "Basavanagudi", "Bengaluru", "Karnataka", "560004", 12.9417, 77.5755),
    ("rajajinagar", "Rajajinagar", "Bengaluru", "Karnataka", "560010", 12.9882, 77.5549),
    ("malleshwaram", "Malleshwaram", "Bengaluru", "Karnataka", "560003", 13.0027, 77.5703),
    ("yelahanka", "Yelahanka", "Bengaluru", "Karnataka", "560064", 13.1007, 77.5963),
    ("rt-nagar", "RT Nagar", "Bengaluru", "Karnataka", "560032", 13.0227, 77.5957),
    ("kr-puram", "KR Puram", "Bengaluru", "Karnataka", "560036", 13.0075, 77.6959),
    ("hoodi", "Hoodi", "Bengaluru", "Karnataka", "560048", 12.9919, 77.7162),
    ("kalyan-nagar", "Kalyan Nagar", "Bengaluru", "Karnataka", "560043", 13.0221, 77.6403),
    ("hennur", "Hennur", "Bengaluru", "Karnataka", "560043", 13.0371, 77.6414),
    ("thanisandra", "Thanisandra", "Bengaluru", "Karnataka", "560064", 13.0522, 77.6316),
    ("uttarahalli", "Uttarahalli", "Bengaluru", "Karnataka", "560061", 12.9056, 77.5455),
    ("rr-nagar", "Rajarajeshwari Nagar", "Bengaluru", "Karnataka", "560098", 12.9274, 77.5155),
    ("kengeri", "Kengeri", "Bengaluru", "Karnataka", "560060", 12.9230, 77.4843),
    ("bommanahalli", "Bommanahalli", "Bengaluru", "Karnataka", "560068", 12.9035, 77.6230),
    ("banaswadi", "Banaswadi", "Bengaluru", "Karnataka", "560033", 13.0142, 77.6519),
    ("domlur", "Domlur", "Bengaluru", "Karnataka", "560071", 12.9625, 77.6382),
    # --- Gurugram, Haryana ---
    ("dlf-phase-3",      "DLF Phase 3",       "Gurugram",  "Haryana",   "122010", 28.4949, 77.0926),
    ("sushant-lok",      "Sushant Lok",       "Gurugram",  "Haryana",   "122009", 28.4663, 77.0759),
    ("golf-course-road", "Golf Course Road",  "Gurugram",  "Haryana",   "122002", 28.4489, 77.0855),
    ("sector-56",        "Sector 56",         "Gurugram",  "Haryana",   "122011", 28.4211, 77.0995),
    ("sector-14",        "Sector 14",         "Gurugram",  "Haryana",   "122001", 28.4663, 77.0300),
    ("dlf-phase-1", "DLF Phase 1", "Gurugram", "Haryana", "122002", 28.4765, 77.0902),
    ("dlf-phase-2", "DLF Phase 2", "Gurugram", "Haryana", "122008", 28.4839, 77.0846),
    ("sector-49", "Sector 49", "Gurugram", "Haryana", "122018", 28.4129, 77.0498),
    ("sector-45", "Sector 45", "Gurugram", "Haryana", "122003", 28.4449, 77.0664),
    ("sector-57", "Sector 57", "Gurugram", "Haryana", "122003", 28.4232, 77.0804),
    ("palam-vihar", "Palam Vihar", "Gurugram", "Haryana", "122017", 28.4983, 77.0203),
    ("sector-82", "Sector 82", "Gurugram", "Haryana", "122004", 28.3931, 76.9589),
    ("sector-102", "Sector 102", "Gurugram", "Haryana", "122006", 28.4755, 76.9712),
    ("sector-65", "Sector 65", "Gurugram", "Haryana", "122101", 28.4030, 77.0696),
    ("manesar", "Manesar", "Gurugram", "Haryana", "122051", 28.3247, 76.9264),
    ("sector-31", "Sector 31", "Gurugram", "Haryana", "122001", 28.4540, 77.0497),
]


def main() -> None:
    with db.connect() as conn:
        for slug, name, city, state, pincode, lat, lon in LOCALITIES:
            db.upsert_locality(
                conn,
                slug=slug,
                name=name,
                city=city,
                state=state,
                pincode=pincode,
                lat=lat,
                lon=lon,
                h3_cell=cell_for(lat, lon),
            )
        conn.commit()
    print(f"Seeded {len(LOCALITIES)} localities across Bengaluru and Gurugram.")


if __name__ == "__main__":
    main()
