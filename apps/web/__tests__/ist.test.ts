import { describe, expect, it } from "vitest";
import * as SunCalc from "suncalc";
import {
  fmtIstDate,
  fmtIstTime,
  istAt,
  istMinutes,
  istNoon,
  splitDuration,
} from "@/lib/ist";

// Koramangala, Bengaluru.
const LAT = 12.9352;
const LON = 77.6245;

describe("IST sun times", () => {
  it("shows Bengaluru's sunrise and sunset as morning and evening, not 12:50 am / 12:19 pm", () => {
    // 20 Nov 2026, 21:00 UTC — already 02:30 on the 21st in India, the hour
    // when a UTC server used to get both the day and the clock wrong.
    const now = new Date(Date.UTC(2026, 10, 20, 21, 0));
    const times = SunCalc.getTimes(istNoon(now), LAT, LON);
    const sunrise = times.sunrise as Date;
    const sunset = times.sunset as Date;
    const rise = fmtIstTime(sunrise);
    const set = fmtIstTime(sunset);
    expect(rise).toMatch(/^6:\d\d am$/);
    expect(set).toMatch(/^5:\d\d pm$/);
    // And it is the IST date (21 Nov) whose sun we describe.
    expect(fmtIstDate(sunrise.toISOString())).toBe("21 Nov 2026");
  });

  it("formats an instant in IST whatever the runtime zone", () => {
    expect(fmtIstTime(new Date("2026-11-20T00:46:00Z"))).toBe("6:16 am");
    expect(fmtIstTime(new Date("2026-11-20T18:29:00Z"))).toBe("11:59 pm");
    expect(fmtIstTime(new Date("2026-11-20T18:30:00Z"))).toBe("12:00 am");
  });

  it("maps the slider's IST minutes to the right instant and back", () => {
    const now = new Date("2026-11-20T21:00:00Z"); // 02:30 IST on the 21st
    expect(istMinutes(now)).toBe(150);
    const fourPm = istAt(16 * 60, now);
    expect(fourPm.toISOString()).toBe("2026-11-21T10:30:00.000Z");
    expect(istMinutes(fourPm)).toBe(960);
  });

  it("never reports 60 minutes in a day-length", () => {
    expect(splitDuration(11 * 3_600_000 + 59.6 * 60_000)).toEqual({ h: 12, m: 0 });
    expect(splitDuration(11 * 3_600_000 + 37 * 60_000)).toEqual({ h: 11, m: 37 });
  });

  it("dates are IST calendar days", () => {
    expect(fmtIstDate("2026-11-20T19:00:00Z")).toBe("21 Nov 2026");
    expect(fmtIstDate("not a date")).toBeNull();
    expect(fmtIstDate(undefined)).toBeNull();
  });
});
