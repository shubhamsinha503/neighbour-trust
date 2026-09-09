/**
 * Matching a visitor's own position to a covered locality.
 *
 * The point of this feature is that a stranger who has never heard of the
 * product can tap once and see the neighbourhood they are standing in — the
 * only fair test of whether these numbers are any good.
 *
 * Which makes the failure mode specific: confidently showing someone the wrong
 * place. Browser positioning is GPS-accurate on a phone and can be tens of
 * kilometres out on a desktop, so "nearest" has to come with a limit, or a
 * visitor in Pune is shown Bengaluru without being told.
 */

import { describe, expect, it } from "vitest";

import { distanceKm, MAX_MATCH_KM, nearestLocality } from "@/components/NearMe";
import type { LocalitySummary } from "@/lib/api";

function locality(
  slug: string, name: string, city: string, lat: number, lon: number,
): LocalitySummary {
  return {
    slug, name, city, state: city === "Bengaluru" ? "Karnataka" : "Haryana",
    h3Cell: "", lat, lon, categoriesWithData: 3,
    score: 80, scoredCategories: ["Schools", "Safety", "Connectivity"],
    topFlag: null,
  };
}

const KORAMANGALA = locality("koramangala", "Koramangala", "Bengaluru", 12.9352, 77.6245);
const INDIRANAGAR = locality("indiranagar", "Indiranagar", "Bengaluru", 12.9784, 77.6408);
const WHITEFIELD = locality("whitefield", "Whitefield", "Bengaluru", 12.9698, 77.7500);
const SECTOR_56 = locality("sector-56", "Sector 56", "Gurugram", 28.4211, 77.0995);

const ALL = [KORAMANGALA, INDIRANAGAR, WHITEFIELD, SECTOR_56];

describe("distanceKm", () => {
  it("is zero at the same point", () => {
    expect(distanceKm(12.9352, 77.6245, 12.9352, 77.6245)).toBeCloseTo(0, 6);
  });

  it("matches a known separation", () => {
    // Koramangala to Indiranagar is a little under 5 km.
    const km = distanceKm(12.9352, 77.6245, 12.9784, 77.6408);
    expect(km).toBeGreaterThan(4);
    expect(km).toBeLessThan(6);
  });

  it("is symmetric", () => {
    const there = distanceKm(12.9352, 77.6245, 28.4211, 77.0995);
    const back = distanceKm(28.4211, 77.0995, 12.9352, 77.6245);
    expect(there).toBeCloseTo(back, 6);
  });
});

describe("nearestLocality", () => {
  it("finds the locality someone is standing in", () => {
    // A point 300 m from the centre of Koramangala.
    const match = nearestLocality(12.9378, 77.6260, ALL);
    expect(match?.locality.slug).toBe("koramangala");
    expect(match?.km).toBeLessThan(1);
  });

  it("prefers the genuinely closest, not the first in the list", () => {
    const match = nearestLocality(12.9780, 77.6400, ALL);
    expect(match?.locality.slug).toBe("indiranagar");
  });

  it("works in the other city too", () => {
    const match = nearestLocality(28.4220, 77.1000, ALL);
    expect(match?.locality.slug).toBe("sector-56");
  });

  it("refuses to place someone in a city they are not in", () => {
    // Pune. Nearest covered locality is hundreds of kilometres away, and
    // showing Bengaluru would be a confident lie rather than a near miss.
    expect(nearestLocality(18.5204, 73.8567, ALL)).toBeNull();
  });

  it("refuses a match just outside the limit", () => {
    // Due north of Koramangala by roughly 8 km, with nothing else near.
    const match = nearestLocality(13.0072, 77.6245, [KORAMANGALA]);
    expect(match).toBeNull();
  });

  it("accepts a match just inside the limit", () => {
    // ~2 km north of Koramangala.
    const match = nearestLocality(12.9532, 77.6245, [KORAMANGALA]);
    expect(match).not.toBeNull();
    expect(match!.km).toBeLessThan(MAX_MATCH_KM);
  });

  it("ignores localities with no coordinate", () => {
    // Not hypothetical: the summary endpoint omitted lat/lon until this
    // feature needed them, and every entry defaulted to (0, 0) — a point in
    // the Atlantic. Left unguarded, a visitor in Bengaluru whose real match was
    // 3 km away could be handed a locality claiming to be 1,800 km nearer.
    const broken = locality("broken", "Broken", "Bengaluru", 0, 0);
    const match = nearestLocality(12.9378, 77.6260, [broken, KORAMANGALA]);
    expect(match?.locality.slug).toBe("koramangala");
  });

  it("returns null when there is nothing to match against", () => {
    expect(nearestLocality(12.9378, 77.6260, [])).toBeNull();
  });

  it("keeps the limit tight enough to mean something", () => {
    // Wide enough to place someone inside a covered city, narrow enough that
    // the next city over is never claimed as theirs.
    expect(MAX_MATCH_KM).toBeGreaterThan(1);
    expect(MAX_MATCH_KM).toBeLessThan(15);
  });
});
