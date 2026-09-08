/**
 * How the site describes what a Trust Score was built from.
 *
 * These exist because the site said two different things at once. The locality
 * page derived the list from the report; the search card hardcoded
 * "air+schools", which was accurate the day it was written and wrong on nearly
 * every card once safety and connectivity began to count. Yelahanka's chip
 * named air quality as being behind its score while Yelahanka has no air
 * quality data at all.
 *
 * So the rule these pin is narrow and absolute: the description is derived from
 * the categories that were actually counted, and never from a constant.
 */

import { describe, expect, it } from "vitest";

import {
  categoryCoverageLabel,
  joinCategoryLabels,
  TOTAL_CATEGORIES,
} from "@/lib/categories";

describe("joinCategoryLabels", () => {
  it("names a single category on its own", () => {
    expect(joinCategoryLabels(["Schools"])).toBe("schools");
  });

  it("joins two with 'and', not a comma", () => {
    expect(joinCategoryLabels(["Schools", "Safety"])).toBe("schools and safety");
  });

  it("uses commas until the last, which takes 'and'", () => {
    expect(joinCategoryLabels(["Schools", "Safety", "Water", "Connectivity"])).toBe(
      "schools, safety, water and connectivity",
    );
  });

  it("returns empty for nothing counted, so callers can pick their own fallback", () => {
    expect(joinCategoryLabels([])).toBe("");
  });

  it("never invents a category that was not passed in", () => {
    // The exact failure: a locality with no air quality data whose card
    // announced air quality anyway.
    const out = joinCategoryLabels(["Schools", "Safety", "Water", "Connectivity"]);
    expect(out).not.toContain("air");
  });
});

describe("categoryCoverageLabel", () => {
  it("counts what was counted, against the number of categories a report has", () => {
    expect(categoryCoverageLabel(["Schools", "Safety"])).toBe("2 of 5 categories");
  });

  it("handles a full house", () => {
    const all = ["Schools", "Safety", "Air quality", "Water", "Connectivity"];
    expect(categoryCoverageLabel(all)).toBe("5 of 5 categories");
    expect(all).toHaveLength(TOTAL_CATEGORIES);
  });

  it("cannot misname a category, which is the whole reason it is a count", () => {
    // A truncated list at 8.5px would be a new way of being wrong; a count is
    // the one form that stays true no matter which categories are behind it.
    expect(categoryCoverageLabel(["Water"])).toBe("1 of 5 categories");
  });

  it("says zero rather than pretending, if it is ever called with nothing", () => {
    expect(categoryCoverageLabel([])).toBe("0 of 5 categories");
  });
});
