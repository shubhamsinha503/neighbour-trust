/**
 * Tests for locality matching.
 *
 * Search is where someone decides whether we cover their neighbourhood at all.
 * A miss here does not look like a bug — it looks like "they don't have my
 * area", and the visitor leaves. So these pin the ways people actually type
 * Indian locality names rather than the happy path.
 */

import { describe, expect, it } from "vitest";

import type { Locality } from "@/lib/api";
import { normalize, searchLocalities } from "@/lib/search";

function locality(
  slug: string,
  name: string,
  city: string,
  pincode?: string,
): Locality {
  return {
    slug,
    name,
    city,
    state: city === "Bengaluru" ? "Karnataka" : "Haryana",
    pincode,
    h3Cell: "8961... ",
    lat: 0,
    lon: 0,
  };
}

const LOCALITIES: Locality[] = [
  locality("indiranagar", "Indiranagar", "Bengaluru", "560038"),
  locality("koramangala", "Koramangala", "Bengaluru", "560034"),
  locality("hsr-layout", "HSR Layout", "Bengaluru", "560102"),
  locality("rr-nagar", "Rajarajeshwari Nagar", "Bengaluru", "560098"),
  locality("jp-nagar", "JP Nagar", "Bengaluru", "560078"),
  locality("electronic-city", "Electronic City", "Bengaluru", "560100"),
  locality("sector-31", "Sector 31", "Gurugram", "122001"),
  locality("sector-56", "Sector 56", "Gurugram", "122011"),
  locality("dlf-phase-3", "DLF Phase 3", "Gurugram", "122010"),
  locality("palam-vihar", "Palam Vihar", "Gurugram", "122017"),
];

const names = (results: Locality[]) => results.map((r) => r.name);

describe("normalize", () => {
  it("strips the punctuation people vary on", () => {
    expect(normalize("J.P. Nagar")).toBe("jpnagar");
    expect(normalize("Sector-56")).toBe("sector56");
    expect(normalize("  HSR  Layout ")).toBe("hsrlayout");
  });
});

describe("searchLocalities", () => {
  it("returns everything for an empty query", () => {
    expect(searchLocalities(LOCALITIES, "")).toHaveLength(LOCALITIES.length);
    expect(searchLocalities(LOCALITIES, "   ")).toHaveLength(LOCALITIES.length);
  });

  it("matches regardless of spacing and punctuation", () => {
    for (const query of ["sector 56", "sector-56", "Sector56", "SECTOR 56"]) {
      expect(names(searchLocalities(LOCALITIES, query))).toContain("Sector 56");
    }
  });

  it("finds long names by the short form people actually use", () => {
    // Nobody types "Rajarajeshwari". The slug carries the spoken form.
    expect(names(searchLocalities(LOCALITIES, "rr nagar"))).toContain(
      "Rajarajeshwari Nagar",
    );
  });

  it("accepts the city names people still use", () => {
    // Gurugram was renamed in 2016 and Bengaluru in 2014. Everyday usage did
    // not follow, and returning nothing would read as "not covered".
    const gurgaon = names(searchLocalities(LOCALITIES, "gurgaon"));
    expect(gurgaon).toContain("Sector 31");
    expect(gurgaon).not.toContain("Indiranagar");

    expect(names(searchLocalities(LOCALITIES, "bangalore"))).toContain(
      "Koramangala",
    );
  });

  it("ranks prefix matches above matches buried mid-name", () => {
    // "sec" must lead with the Sectors, not Electronic City.
    const results = names(searchLocalities(LOCALITIES, "sec"));
    expect(results[0]).toMatch(/^Sector/);
  });

  it("ranks a locality's own name above a city match", () => {
    // "palam" is a locality name; nothing should outrank it.
    expect(names(searchLocalities(LOCALITIES, "palam"))[0]).toBe("Palam Vihar");
  });

  it("finds localities by pincode", () => {
    expect(names(searchLocalities(LOCALITIES, "560102"))).toEqual([
      "HSR Layout",
    ]);
  });

  it("does not match pincodes on one or two digits", () => {
    // Every Bengaluru pincode starts "560". Matching on a prefix that short
    // would return the whole city for a stray keystroke.
    //
    // "56" still returns Sector 56, and should — that is a name match, and
    // someone typing "56" in Gurugram means exactly that. What must not happen
    // is Indiranagar and Koramangala arriving because of their pincodes.
    const results = names(searchLocalities(LOCALITIES, "56"));
    expect(results).toEqual(["Sector 56"]);
  });

  it("returns nothing rather than something wrong", () => {
    expect(searchLocalities(LOCALITIES, "andheri")).toHaveLength(0);
  });

  it("orders ties predictably so the list does not reshuffle while typing", () => {
    const once = names(searchLocalities(LOCALITIES, "nagar"));
    const twice = names(searchLocalities(LOCALITIES, "nagar"));
    expect(once).toEqual(twice);
    expect(once).toEqual([...once].sort());
  });
});
