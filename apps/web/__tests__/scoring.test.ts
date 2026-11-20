import { describe, expect, it } from "vitest";
import type { LocalityReport, ReportCategory } from "@/lib/api";
import { breakdown, joinLabels, uncountedReason } from "@/lib/scoring";

function cat(over: Partial<ReportCategory> & Pick<ReportCategory, "category" | "label" | "weight">): ReportCategory {
  return {
    score: null,
    confidence: null,
    available: false,
    counted: false,
    isBaseline: false,
    status: "no data",
    summary: "",
    historical: false,
    evidence: [],
    ...over,
  };
}

const trust = (coveragePct: number): LocalityReport["trustScore"] => ({
  score: 80,
  coveragePct,
  categoriesCounted: 0,
  categoriesTotal: 5,
  powerPenalty: 0,
  minCoveragePct: 35,
});

describe("score breakdown", () => {
  const categories = [
    cat({ category: "air_quality", label: "Air quality", weight: 0.24, score: 90, available: true, counted: true, confidence: "low" }),
    cat({ category: "schools", label: "Schools", weight: 0.24, score: 75, available: true, counted: true, confidence: "medium" }),
    cat({ category: "crime", label: "Safety", weight: 0.24, score: 80, available: true, isBaseline: true }),
    cat({ category: "water", label: "Water", weight: 0.17, available: true, summary: "2 incident(s) in local press (12 months) — too few to score" }),
    cat({ category: "infrastructure", label: "Connectivity", weight: 0.11 }),
  ];
  const b = breakdown({ categories, trustScore: trust(48) });

  it("renormalises shares over what was counted", () => {
    expect(b.counted.map((p) => [p.label, p.sharePct, p.basePct])).toEqual([
      ["Air quality", 50, 24],
      ["Schools", 50, 24],
    ]);
  });

  it("names everything left out, with a reason that never implies 'fine'", () => {
    expect(b.partial).toBe(true);
    expect(b.notCounted.map((p) => p.label)).toEqual(["Safety", "Water", "Connectivity"]);
    expect(b.notCounted[0].reason).toMatch(/baseline, never counted/);
    expect(b.notCounted[1].reason).toMatch(/too few to score/);
    expect(b.notCounted[2].reason).toMatch(/unknown, not fine/);
  });

  it("calls out low-confidence inputs", () => {
    expect(b.weakInputs).toEqual(["Air quality"]);
  });

  it("is not partial when every category is counted", () => {
    const all = categories.map((c) => ({ ...c, available: true, counted: true, isBaseline: false, score: 70 }));
    const full = breakdown({ categories: all, trustScore: trust(100) });
    expect(full.partial).toBe(false);
    expect(full.counted.reduce((s, p) => s + p.sharePct, 0)).toBe(100);
  });

  it("explains stale readings", () => {
    expect(
      uncountedReason(cat({ category: "air_quality", label: "Air", weight: 0.24, available: true, historical: true, score: 60 })),
    ).toMatch(/too old/);
  });

  it("joins labels", () => {
    expect(joinLabels(["A"])).toBe("A");
    expect(joinLabels(["A", "B", "C"])).toBe("A, B and C");
  });
});
