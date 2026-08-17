"""Seed the launch localities for Bengaluru and Gurugram.

Deliberately a short, hand-checked list rather than a bulk import. Locality
boundaries in India are informal and contested; these are centroids of areas a
buyer would actually name when searching, which is the unit the product is about.
Growing this list is cheap — getting it wrong is the sort of error that silently
attributes one neighbourhood's air to another.

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
    # --- Gurugram, Haryana ---
    ("dlf-phase-3",      "DLF Phase 3",       "Gurugram",  "Haryana",   "122010", 28.4949, 77.0926),
    ("sushant-lok",      "Sushant Lok",       "Gurugram",  "Haryana",   "122009", 28.4663, 77.0759),
    ("golf-course-road", "Golf Course Road",  "Gurugram",  "Haryana",   "122002", 28.4489, 77.0855),
    ("sector-56",        "Sector 56",         "Gurugram",  "Haryana",   "122011", 28.4211, 77.0995),
    ("sector-14",        "Sector 14",         "Gurugram",  "Haryana",   "122001", 28.4663, 77.0300),
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
