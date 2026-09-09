/**
 * What order the index shows localities in.
 *
 * It was alphabetical, so a first-time visitor met Banashankari, Banaswadi and
 * Basavanagudi — three names chosen by nothing but the alphabet, which teach a
 * stranger nothing about what the product does.
 *
 * The rule these pin is the one that matters most, and it is a rule about
 * honesty rather than taste: a score built from two categories must never be
 * presented above one built from five. Basavanagudi's 93 came from two
 * categories and sat above better-evidenced neighbourhoods scoring lower. Rank
 * those against each other and the page is comparing numbers that do not mean
 * the same thing.
 */

import { describe, expect, it } from "vitest";

import {
  browseList,
  byCoverageThenName,
  citiesOf,
  coverageOf,
  filterByCity,
} from "@/lib/ordering";
import type { LocalitySummary } from "@/lib/api";

function locality(
  name: string,
  city: string,
  score: number | null,
  categories: string[],
): LocalitySummary {
  return {
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    city,
    state: city === "Bengaluru" ? "Karnataka" : "Haryana",
    h3Cell: "",
    lat: 12.9,
    lon: 77.6,
    categoriesWithData: categories.length,
    score,
    scoredCategories: categories,
    topFlag: null,
  };
}

const FIVE = ["Schools", "Safety", "Air quality", "Water", "Connectivity"];
const TWO = ["Schools", "Connectivity"];

// The real pair that exposed the problem.
const BASAVANAGUDI = locality("Basavanagudi", "Bengaluru", 93, TWO);
const WELL_COVERED = locality("Whitefield", "Bengaluru", 84, FIVE);
const SECTOR_56 = locality("Sector 56", "Gurugram", 78, FIVE);
const UNSCORED = locality("Manesar", "Gurugram", null, []);

describe("coverageOf", () => {
  it("counts the categories behind the score", () => {
    expect(coverageOf(WELL_COVERED)).toBe(5);
    expect(coverageOf(BASAVANAGUDI)).toBe(2);
    expect(coverageOf(UNSCORED)).toBe(0);
  });
});

describe("byCoverageThenName", () => {
  it("puts a well-evidenced lower score above a thin higher one", () => {
    // The whole point. 84 from five categories outranks 93 from two.
    const sorted = [BASAVANAGUDI, WELL_COVERED].sort(byCoverageThenName);
    expect(sorted[0].name).toBe("Whitefield");
  });

  it("does not rank by score", () => {
    const high = locality("High", "Bengaluru", 99, TWO);
    const low = locality("Low", "Bengaluru", 51, FIVE);
    expect([high, low].sort(byCoverageThenName)[0].name).toBe("Low");
  });

  it("falls back to alphabetical within the same coverage", () => {
    const a = locality("Adugodi", "Bengaluru", 60, FIVE);
    const z = locality("Zuzuvadi", "Bengaluru", 95, FIVE);
    expect([z, a].sort(byCoverageThenName).map((l) => l.name)).toEqual([
      "Adugodi",
      "Zuzuvadi",
    ]);
  });

  it("sorts an unscored locality last rather than as a zero", () => {
    const sorted = [UNSCORED, BASAVANAGUDI, WELL_COVERED].sort(byCoverageThenName);
    expect(sorted[sorted.length - 1].name).toBe("Manesar");
  });

  it("is a stable comparator over a whole list", () => {
    const all = [UNSCORED, BASAVANAGUDI, WELL_COVERED, SECTOR_56];
    const once = [...all].sort(byCoverageThenName).map((l) => l.name);
    const twice = [...all].sort(byCoverageThenName).sort(byCoverageThenName)
      .map((l) => l.name);
    expect(twice).toEqual(once);
  });
});

describe("citiesOf", () => {
  it("lists each city once", () => {
    expect(citiesOf([BASAVANAGUDI, WELL_COVERED, SECTOR_56])).toEqual([
      "Bengaluru",
      "Gurugram",
    ]);
  });

  it("is empty for an empty list", () => {
    expect(citiesOf([])).toEqual([]);
  });
});

describe("filterByCity", () => {
  it("narrows to one city", () => {
    const only = filterByCity([BASAVANAGUDI, SECTOR_56], "Gurugram");
    expect(only.map((l) => l.name)).toEqual(["Sector 56"]);
  });

  it("null means all of them", () => {
    expect(filterByCity([BASAVANAGUDI, SECTOR_56], null)).toHaveLength(2);
  });
});

describe("browseList", () => {
  it("filters and orders together", () => {
    const list = browseList([UNSCORED, SECTOR_56, BASAVANAGUDI], "Gurugram");
    expect(list.map((l) => l.name)).toEqual(["Sector 56", "Manesar"]);
  });

  it("does not mutate the list it was given", () => {
    const input = [BASAVANAGUDI, WELL_COVERED];
    const before = input.map((l) => l.name);
    browseList(input, null);
    expect(input.map((l) => l.name)).toEqual(before);
  });
});
