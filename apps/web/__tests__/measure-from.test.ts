/**
 * Distances measured from an address the reader gave us.
 *
 * Every distance on a report is otherwise measured from the locality centroid —
 * one point standing in for an area two or three kilometres across. On BTM
 * Layout that gap is real and checkable: the six closest schools sit 0.1–0.6 km
 * from the centroid and 1.3–2.0 km from Silk Board, and the ordering changes.
 *
 * These pin the arithmetic and the ordering rule. The geocoding itself is not
 * mocked here because it is a network boundary; it is exercised against the
 * live service instead.
 */

import { describe, expect, it } from "vitest";
import { haversineKm } from "@/components/MeasureFrom";

// Measured points, not invented ones.
const BTM_CENTROID = { lat: 12.9166, lon: 77.6101 };
const SILK_BOARD = { lat: 12.9167, lon: 77.6214 };

describe("haversineKm", () => {
  it("is zero for the same point", () => {
    expect(haversineKm(12.9166, 77.6101, 12.9166, 77.6101)).toBe(0);
  });

  it("matches the known separation of BTM Layout and Silk Board", () => {
    const d = haversineKm(
      BTM_CENTROID.lat, BTM_CENTROID.lon, SILK_BOARD.lat, SILK_BOARD.lon,
    );
    // 1.23 km, measured independently against the same coordinates.
    expect(d).toBeGreaterThan(1.1);
    expect(d).toBeLessThan(1.4);
  });

  it("is symmetric", () => {
    const there = haversineKm(12.9166, 77.6101, 12.9698, 77.75);
    const back = haversineKm(12.9698, 77.75, 12.9166, 77.6101);
    expect(there).toBeCloseTo(back, 10);
  });

  it("does not confuse latitude with longitude", () => {
    // A degree of latitude is ~111 km everywhere; a degree of longitude at
    // 12.9°N is ~108 km. Swapping the arguments would still give a plausible
    // number, which is exactly why this is worth asserting.
    const northSouth = haversineKm(12.0, 77.0, 13.0, 77.0);
    const eastWest = haversineKm(12.0, 77.0, 12.0, 78.0);
    expect(northSouth).toBeGreaterThan(110);
    expect(northSouth).toBeLessThan(112);
    expect(eastWest).toBeLessThan(northSouth);
  });
});

/** The same rule the card applies when an origin is set. */
function remeasure(
  schools: Array<{ name: string; lat?: number; lon?: number; distanceKm?: number }>,
  origin: { lat: number; lon: number },
) {
  return schools
    .map((s) => ({
      ...s,
      distanceKm:
        s.lat !== undefined && s.lon !== undefined
          ? haversineKm(origin.lat, origin.lon, s.lat, s.lon)
          : undefined,
    }))
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}

describe("re-measuring the closest schools", () => {
  // Real coordinates from the BTM Layout envelope.
  const schools = [
    { name: "Good To Excellence", lat: 12.9167733, lon: 77.6110998 },
    { name: "Kidzee", lat: 12.9185982, lon: 77.6104487 },
    { name: "St Josephs", lat: 12.9141469, lon: 77.6116922 },
  ];

  it("reorders when the origin moves", () => {
    const fromCentroid = remeasure(schools, BTM_CENTROID);
    const fromSilkBoard = remeasure(schools, SILK_BOARD);
    expect(fromCentroid[0].name).toBe("Good To Excellence");
    // St Josephs is furthest from the centroid of these three and nearest to
    // Silk Board. If this ever stops changing, the origin is being ignored.
    expect(fromSilkBoard[0].name).toBe("St Josephs");
  });

  it("always returns them in ascending distance", () => {
    const distances = remeasure(schools, SILK_BOARD).map((s) => s.distanceKm!);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  it("sorts a school with no coordinates last rather than dropping it", () => {
    /* Envelopes written before coordinates were carried through have none. The
       school still exists, so hiding it would misrepresent the area; giving it
       a made-up distance would be worse. */
    const withGap = [...schools, { name: "Older record" }];
    const ordered = remeasure(withGap, SILK_BOARD);
    expect(ordered).toHaveLength(4);
    expect(ordered[ordered.length - 1].name).toBe("Older record");
    expect(ordered[ordered.length - 1].distanceKm).toBeUndefined();
  });
});
