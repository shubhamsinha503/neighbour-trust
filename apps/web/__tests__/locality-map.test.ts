/**
 * Projecting mapped features onto the locality map.
 *
 * The product is about places and had no picture of one: every locality page
 * rendered the same ring above the same paragraphs, so Koramangala and
 * Yelahanka looked identical. The coordinates were already stored — used to
 * compute a distance and then discarded into a sentence.
 *
 * Two properties are worth pinning because both fail silently. An inverted axis
 * produces a map that looks entirely plausible and puts the industrial estate
 * on the wrong side of the neighbourhood; and unrounded coordinates differ
 * between the server and the browser in the last decimal place, which React
 * reports as a hydration mismatch on every dot.
 */

import { describe, expect, it } from "vitest";

import { project } from "@/components/LocalityMap";

// Koramangala, and the frame the component draws.
const LAT = 12.9352;
const LON = 77.6245;
const SIZE = 320;
const CENTRE = SIZE / 2;

describe("project", () => {
  it("puts the centre in the middle", () => {
    const p = project(LAT, LON, LAT, LON);
    expect(p.x).toBe(CENTRE);
    expect(p.y).toBe(CENTRE);
    expect(p.km).toBeCloseTo(0, 5);
  });

  it("draws north upward", () => {
    // SVG's y axis grows downward, so north has to be a *smaller* y. Getting
    // this backwards yields a map that looks fine and is vertically mirrored.
    const north = project(LAT + 0.01, LON, LAT, LON);
    expect(north.y).toBeLessThan(CENTRE);
    expect(north.x).toBeCloseTo(CENTRE, 1);
  });

  it("draws east to the right", () => {
    const east = project(LAT, LON + 0.01, LAT, LON);
    expect(east.x).toBeGreaterThan(CENTRE);
    expect(east.y).toBeCloseTo(CENTRE, 1);
  });

  it("draws south and west opposite to north and east", () => {
    const north = project(LAT + 0.01, LON, LAT, LON);
    const south = project(LAT - 0.01, LON, LAT, LON);
    const east = project(LAT, LON + 0.01, LAT, LON);
    const west = project(LAT, LON - 0.01, LAT, LON);
    expect(CENTRE - north.y).toBeCloseTo(south.y - CENTRE, 1);
    expect(east.x - CENTRE).toBeCloseTo(CENTRE - west.x, 1);
  });

  it("measures distance in kilometres", () => {
    // One hundredth of a degree of latitude is ~1.106 km anywhere.
    expect(project(LAT + 0.01, LON, LAT, LON).km).toBeCloseTo(1.106, 2);
  });

  it("narrows longitude with latitude", () => {
    // A degree of longitude is shorter further from the equator, so the same
    // degree offset must be a shorter distance at Gurugram than at Bengaluru.
    const blr = project(12.9352, 77.6345, 12.9352, 77.6245).km;
    const ggn = project(28.4595, 77.0366, 28.4595, 77.0266).km;
    expect(ggn).toBeLessThan(blr);
  });

  it("rounds coordinates so the server and the browser agree", () => {
    // Unrounded, these differed in the last decimal place between Node and the
    // browser — 39.38441675762962 against ...64 — and React reported a
    // hydration mismatch for every dot on the map.
    const p = project(12.9411, 77.6301, LAT, LON);
    expect(p.x).toBe(Math.round(p.x * 100) / 100);
    expect(p.y).toBe(Math.round(p.y * 100) / 100);
  });

  it("keeps a feature at the frame edge inside the viewBox", () => {
    // 3.5 km is the industrial search radius, the widest thing drawn.
    const edge = project(LAT + 3.5 / 110.574, LON, LAT, LON);
    expect(edge.y).toBeGreaterThanOrEqual(0);
    expect(edge.y).toBeLessThanOrEqual(SIZE);
  });
});
