import { describe, expect, it } from "vitest";
import { splitCitations } from "@/lib/citations";

describe("splitCitations", () => {
  it("turns known ids into markers and keeps the prose", () => {
    expect(splitCitations("Air is 86 [2]. Water unknown [3].", [2, 3])).toEqual([
      { type: "text", value: "Air is 86 " },
      { type: "cite", id: 2 },
      { type: "text", value: ". Water unknown " },
      { type: "cite", id: 3 },
      { type: "text", value: "." },
    ]);
  });

  it("drops an id that is not among the citations", () => {
    const parts = splitCitations("Safe [9].", [2]);
    expect(parts.some((p) => p.type === "cite")).toBe(false);
    expect(parts.map((p) => (p.type === "text" ? p.value : "")).join("")).toBe("Safe .");
  });

  it("handles adjacent markers and no markers", () => {
    expect(splitCitations("[1][2]", [1, 2])).toEqual([
      { type: "cite", id: 1 },
      { type: "cite", id: 2 },
    ]);
    expect(splitCitations("No data.", [])).toEqual([{ type: "text", value: "No data." }]);
  });
});
