/**
 * India Standard Time helpers for anything that turns an instant into a
 * wall-clock time or a calendar day.
 *
 * Every covered locality is in India, so its sun times, slider clocks and "as
 * of" dates are shown in IST whatever zone the viewer's device or the server is
 * in. Leaving that to the runtime is how Bengaluru's 06:00 sunrise rendered as
 * "12:50 am" on the server (UTC), and how the shadow map's slider showed a US
 * visitor shadows for the middle of the Indian night.
 *
 * IST is UTC+5:30 with no daylight saving, so a fixed offset is exact.
 */

export const IST_OFFSET_MIN = 330;
const MIN_MS = 60_000;
const DAY_MS = 86_400_000;

/** Minutes past IST midnight for an instant (0–1439). */
export function istMinutes(at: Date = new Date()): number {
  const m = Math.floor(at.getTime() / MIN_MS) + IST_OFFSET_MIN;
  return ((m % 1440) + 1440) % 1440;
}

/** The instant of IST midnight that starts the IST calendar day containing `at`. */
function istDayStart(at: Date): number {
  const shifted = at.getTime() + IST_OFFSET_MIN * MIN_MS;
  return Math.floor(shifted / DAY_MS) * DAY_MS - IST_OFFSET_MIN * MIN_MS;
}

/** The instant `mins` minutes after IST midnight on the IST day containing `at`. */
export function istAt(mins: number, at: Date = new Date()): Date {
  return new Date(istDayStart(at) + mins * MIN_MS);
}

/** Noon IST on the IST day containing `at` — a stable anchor for "today's" sun. */
export function istNoon(at: Date = new Date()): Date {
  return istAt(12 * 60, at);
}

/** The IST calendar year containing `at`. */
export function istYear(at: Date = new Date()): number {
  return new Date(at.getTime() + IST_OFFSET_MIN * MIN_MS).getUTCFullYear();
}

/** Noon IST on a given calendar date (month is 0-based, like Date). */
export function istNoonOn(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day, 12, 0) - IST_OFFSET_MIN * MIN_MS);
}

/** "6:15 am"-style 12-hour clock for minutes past midnight. */
export function fmtClockMinutes(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const ampm = h < 12 ? "am" : "pm";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** "6:15 am" in IST for an instant — identical on server and client. */
export function fmtIstTime(d: Date): string {
  return fmtClockMinutes(istMinutes(d));
}

/** Hours and minutes of a duration, rounded to the minute (never "11h 60m"). */
export function splitDuration(ms: number): { h: number; m: number } {
  const total = Math.round(ms / MIN_MS);
  return { h: Math.floor(total / 60), m: total % 60 };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "4 Nov 2026" in IST for an ISO timestamp; null when it cannot be read. */
export function fmtIstDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t + IST_OFFSET_MIN * MIN_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
