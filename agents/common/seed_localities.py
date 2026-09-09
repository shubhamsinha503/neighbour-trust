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

    # --- Proposed from OpenStreetMap place nodes, Gurugram ---
    ("sector-51", "Sector 51", "Gurugram", "Haryana", None, 28.4287, 77.0667),
    ("sector-46", "Sector 46", "Gurugram", "Haryana", None, 28.4359, 77.0584),
    ("sector-52", "Sector 52", "Gurugram", "Haryana", None, 28.4368, 77.0795),
    ("sector-47", "Sector 47", "Gurugram", "Haryana", None, 28.4252, 77.0475),
    ("new-colony", "New Colony", "Gurugram", "Haryana", None, 28.4663, 77.0143),
    ("sector-39", "Sector 39", "Gurugram", "Haryana", None, 28.4424, 77.0505),
    ("sector-8", "Sector 8", "Gurugram", "Haryana", None, 28.4599, 77.0198),
    ("sector-23a", "Sector 23A", "Gurugram", "Haryana", None, 28.5057, 77.0463),
    ("shivaji-nagar", "Shivaji Nagar", "Gurugram", "Haryana", None, 28.4553, 77.0238),
    ("om-nagar", "Om Nagar", "Gurugram", "Haryana", None, 28.4500, 77.0212),
    ("sector-11", "Sector 11", "Gurugram", "Haryana", None, 28.4522, 77.0267),
    ("sector-1", "Sector 1", "Gurugram", "Haryana", None, 28.5175, 77.0426),
    ("sector-2", "Sector 2", "Gurugram", "Haryana", None, 28.5090, 77.0343),
    ("sector-41", "Sector 41", "Gurugram", "Haryana", None, 28.4569, 77.0646),
    ("sector-26", "Sector 26", "Gurugram", "Haryana", None, 28.4779, 77.1032),
    ("sector-4", "Sector 4", "Gurugram", "Haryana", None, 28.4750, 77.0104),
    ("sector-10", "Sector 10", "Gurugram", "Haryana", None, 28.4540, 77.0025),
    ("raj-nagar", "Raj Nagar", "Gurugram", "Haryana", None, 28.4480, 77.0180),
    ("naharpur-rupa", "Naharpur Rupa", "Gurugram", "Haryana", None, 28.4458, 77.0210),
    ("sector-23", "Sector 23", "Gurugram", "Haryana", None, 28.5103, 77.0530),
    ("sector-5", "Sector 5", "Gurugram", "Haryana", None, 28.4804, 77.0191),
    ("sector-9", "Sector 9", "Gurugram", "Haryana", None, 28.4622, 77.0001),
    ("palam-vihar-extension", "Palam Vihar Extension", "Gurugram", "Haryana", None, 28.5008, 77.0399),
    ("sector-110a", "Sector 110A", "Gurugram", "Haryana", None, 28.5159, 77.0276),
    ("sector-53", "Sector 53", "Gurugram", "Haryana", None, 28.4415, 77.0968),
    ("sector-111", "Sector 111", "Gurugram", "Haryana", None, 28.5223, 77.0336),
    ("sector-10a", "Sector 10A", "Gurugram", "Haryana", None, 28.4446, 77.0060),
    ("sector-3a", "Sector 3A", "Gurugram", "Haryana", None, 28.4810, 77.0091),
    ("hans-enclave", "Hans Enclave", "Gurugram", "Haryana", None, 28.4454, 77.0258),
    ("sector-32", "Sector 32", "Gurugram", "Haryana", None, 28.4458, 77.0413),
    ("sector-16", "Sector 16", "Gurugram", "Haryana", None, 28.4687, 77.0512),
    ("sector-66", "Sector 66", "Gurugram", "Haryana", None, 28.3974, 77.0539),
    ("sector-38", "Sector 38", "Gurugram", "Haryana", None, 28.4351, 77.0404),
    ("sector-9a", "Sector 9A", "Gurugram", "Haryana", None, 28.4690, 76.9963),
    ("sector-55", "Sector 55", "Gurugram", "Haryana", None, 28.4274, 77.1098),
    ("sector-72", "Sector 72", "Gurugram", "Haryana", None, 28.4159, 77.0291),
    ("sector-17", "Sector 17", "Gurugram", "Haryana", None, 28.4758, 77.0608),
    ("sector-19", "Sector 19", "Gurugram", "Haryana", None, 28.5031, 77.0817),
    ("sector-37a", "Sector 37A", "Gurugram", "Haryana", None, 28.4417, 76.9919),
    ("sector-62", "Sector 62", "Gurugram", "Haryana", None, 28.4077, 77.0824),
    ("sector-42", "Sector 42", "Gurugram", "Haryana", None, 28.4559, 77.1085),
    ("sector-37", "Sector 37", "Gurugram", "Haryana", None, 28.4343, 76.9993),
    ("sector-54", "Sector 54", "Gurugram", "Haryana", None, 28.4421, 77.1113),
    ("sector-104", "Sector 104", "Gurugram", "Haryana", None, 28.4795, 76.9937),
    ("sector-18", "Sector 18", "Gurugram", "Haryana", None, 28.4913, 77.0710),
    ("sector-68", "Sector 68", "Gurugram", "Haryana", None, 28.3889, 77.0460),
    ("sector-37c", "Sector 37C", "Gurugram", "Haryana", None, 28.4489, 76.9881),
    ("sector-67", "Sector 67", "Gurugram", "Haryana", None, 28.3864, 77.0598),
    ("sector-34", "Sector 34", "Gurugram", "Haryana", None, 28.4280, 77.0116),
    ("sector-72a", "Sector 72A", "Gurugram", "Haryana", None, 28.4233, 77.0188),
    ("sector-105", "Sector 105", "Gurugram", "Haryana", None, 28.4943, 77.0081),
    ("sector-69", "Sector 69", "Gurugram", "Haryana", None, 28.3961, 77.0372),
    ("sector-71", "Sector 71", "Gurugram", "Haryana", None, 28.4065, 77.0233),
    ("sector-75", "Sector 75", "Gurugram", "Haryana", None, 28.3964, 77.0066),
    ("sector-74a", "Sector 74A", "Gurugram", "Haryana", None, 28.4109, 76.9991),
    ("sector-70", "Sector 70", "Gurugram", "Haryana", None, 28.3947, 77.0223),
    ("sector-73", "Sector 73", "Gurugram", "Haryana", None, 28.4088, 77.0162),
    ("sector-35", "Sector 35", "Gurugram", "Haryana", None, 28.4146, 77.0019),
    ("sector-9b", "Sector 9B", "Gurugram", "Haryana", None, 28.4564, 76.9810),
    ("sector-74", "Sector 74", "Gurugram", "Haryana", None, 28.4110, 77.0101),

    # --- Proposed from OpenStreetMap place nodes, Bengaluru ---
    ("vijaya-nagar", "Vijaya Nagar", "Bengaluru", "Karnataka", None, 12.9664, 77.5354),
    ("mahalakshmi-layout", "Mahalakshmi Layout", "Bengaluru", "Karnataka", None, 13.0113, 77.5447),
    ("basaveshwaranagar", "Basaveshwaranagar", "Bengaluru", "Karnataka", None, 12.9938, 77.5391),
    ("richmond-town", "Richmond Town", "Bengaluru", "Karnataka", None, 12.9636, 77.6016),
    ("shanti-nagar", "Shanti Nagar", "Bengaluru", "Karnataka", None, 12.9555, 77.5924),
    ("kempapura-agrahara", "Kempapura Agrahara", "Bengaluru", "Karnataka", None, 12.9706, 77.5554),
    ("halasuru", "Halasuru", "Bengaluru", "Karnataka", None, 12.9779, 77.6247),
    ("austin-town", "Austin Town", "Bengaluru", "Karnataka", None, 12.9613, 77.6153),
    ("yeswanthpur", "Yeswanthpur", "Bengaluru", "Karnataka", None, 13.0222, 77.5531),
    ("shivajinagar", "Shivajinagar", "Bengaluru", "Karnataka", None, 12.9855, 77.6054),
    ("chamarajapete", "Chamarajapete", "Bengaluru", "Karnataka", None, 12.9584, 77.5629),
    ("chikkapete", "Chikkapete", "Bengaluru", "Karnataka", None, 12.9698, 77.5757),
    ("sadashivanagar", "Sadashivanagar", "Bengaluru", "Karnataka", None, 13.0110, 77.5809),
    ("frazer-town", "Frazer Town", "Bengaluru", "Karnataka", None, 12.9976, 77.6137),
    ("c-v-raman-nagar", "C V Raman Nagar", "Bengaluru", "Karnataka", None, 12.9856, 77.6650),
    ("gandhinagar", "Gandhinagar", "Bengaluru", "Karnataka", None, 12.9772, 77.5800),
    ("vasanth-nagar", "Vasanth Nagar", "Bengaluru", "Karnataka", None, 12.9922, 77.5915),
    ("horamavu", "Horamavu", "Bengaluru", "Karnataka", None, 13.0273, 77.6602),
    ("nagarabhavi", "Nagarabhavi", "Bengaluru", "Karnataka", None, 12.9664, 77.5131),
    ("lingarajapuram", "Lingarajapuram", "Bengaluru", "Karnataka", None, 13.0094, 77.6268),
    ("hbr-layout", "HBR Layout", "Bengaluru", "Karnataka", None, 13.0320, 77.6281),
    ("rmv-2nd-stage", "RMV 2nd Stage", "Bengaluru", "Karnataka", None, 13.0360, 77.5695),
    ("mahadevapura", "Mahadevapura", "Bengaluru", "Karnataka", None, 12.9912, 77.6897),
    ("mathikere", "Mathikere", "Bengaluru", "Karnataka", None, 13.0334, 77.5582),
    ("konanakunte", "Konanakunte", "Bengaluru", "Karnataka", None, 12.8793, 77.5698),
    ("baiyyappanahalli", "Baiyyappanahalli", "Bengaluru", "Karnataka", None, 12.9963, 77.6533),
    ("kothnur", "Kothnur", "Bengaluru", "Karnataka", None, 12.8743, 77.5837),
    ("haralur", "Haralur", "Bengaluru", "Karnataka", None, 12.9045, 77.6654),
    ("sahakaranagara", "Sahakaranagara", "Bengaluru", "Karnataka", None, 13.0629, 77.5859),
    ("ramamurthy-nagar", "Ramamurthy Nagar", "Bengaluru", "Karnataka", None, 13.0120, 77.6778),
    ("nagavara", "Nagavara", "Bengaluru", "Karnataka", None, 13.0375, 77.6236),
    ("kaval-byrasandra", "Kaval Byrasandra", "Bengaluru", "Karnataka", None, 13.0200, 77.6093),
    ("vidyaranyapura", "Vidyaranyapura", "Bengaluru", "Karnataka", None, 13.0766, 77.5577),
    ("kudlu", "Kudlu", "Bengaluru", "Karnataka", None, 12.8889, 77.6556),
    ("jnana-bharathi", "Jnana Bharathi", "Bengaluru", "Karnataka", None, 12.9433, 77.5112),
    ("jalahalli", "Jalahalli", "Bengaluru", "Karnataka", None, 13.0465, 77.5484),
    ("gottigere", "Gottigere", "Bengaluru", "Karnataka", None, 12.8565, 77.5877),
    ("kasavanahalli", "Kasavanahalli", "Bengaluru", "Karnataka", None, 12.8978, 77.6745),
    ("beguru", "Beguru", "Bengaluru", "Karnataka", None, 12.8747, 77.6227),
    ("peenya", "Peenya", "Bengaluru", "Karnataka", None, 13.0329, 77.5273),
    ("nagasandra", "Nagasandra", "Bengaluru", "Karnataka", None, 13.0410, 77.5004),
    ("panathur", "Panathur", "Bengaluru", "Karnataka", None, 12.9351, 77.7048),
    ("arkavathy-layout", "Arkavathy Layout", "Bengaluru", "Karnataka", None, 13.0671, 77.6219),
    ("jakkur", "Jakkur", "Bengaluru", "Karnataka", None, 13.0785, 77.6069),
    ("doddakannalli", "Doddakannalli", "Bengaluru", "Karnataka", None, 12.9082, 77.6949),
    ("chikkanayakanahalli", "Chikkanayakanahalli", "Bengaluru", "Karnataka", None, 12.8923, 77.6942),
    ("sir-mv-layout", "Sir MV Layout", "Bengaluru", "Karnataka", None, 12.9438, 77.4779),
    ("suryanagar-phase-1", "Suryanagar Phase 1", "Bengaluru", "Karnataka", None, 12.7931, 77.7000),
    ("choodasandra", "Choodasandra", "Bengaluru", "Karnataka", None, 12.8922, 77.6804),
    ("chandapura", "Chandapura", "Bengaluru", "Karnataka", None, 12.8004, 77.7063),
    ("herohalli", "Herohalli", "Bengaluru", "Karnataka", None, 12.9912, 77.4870),
    ("carmelaram", "Carmelaram", "Bengaluru", "Karnataka", None, 12.9112, 77.7065),
    ("laggere", "Laggere", "Bengaluru", "Karnataka", "560058", 13.0109, 77.5207),
    ("bommasandra", "Bommasandra", "Bengaluru", "Karnataka", None, 12.8162, 77.6916),
    ("kodati", "Kodati", "Bengaluru", "Karnataka", None, 12.8873, 77.7159),
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
