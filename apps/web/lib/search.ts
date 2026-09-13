/**
 * Matching locality names the way people actually type them.
 *
 * The list is a few hundred entries, so this runs in the browser over data the page already
 * has — no endpoint, no debounce, no loading state. What matters is not speed
 * but tolerating how Indian locality names get written.
 *
 * Three things people do that plain substring matching gets wrong:
 *
 *   1. **The city has two names.** Most people still type "Gurgaon", and a very
 *      large number type "Bangalore". Both are correct-in-practice names for the
 *      launch cities and neither appears in our data.
 *   2. **Punctuation and spacing are arbitrary.** "Sector 56", "sector-56" and
 *      "sector56" are the same query. So are "JP Nagar" and "j.p. nagar".
 *   3. **Long names get initialised.** Nobody types "Rajarajeshwari Nagar"; they
 *      type "RR Nagar". Our slugs already encode the short form people use, so
 *      matching the slug as well as the name handles this for free.
 */

import type { Locality } from "@/lib/api";

/** Lowercase, strip everything that isn't a letter or digit. */
export function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Names for a place that are common in speech but absent from our data.
 *
 * Deliberately only the city renames. Both are cases where the official name
 * changed and everyday usage did not follow — a buyer searching "Gurgaon" is not
 * making a mistake, and returning nothing would read as "we don't cover it".
 */
const CITY_ALIASES: Record<string, string[]> = {
  Gurugram: ["gurgaon", "ggn"],
  Bengaluru: ["bangalore", "blr", "bengaluru"],
};

export interface Scored {
  locality: Locality;
  score: number;
}

/**
 * Rank one locality against a normalized query. Higher is better; 0 means no
 * match at all.
 *
 * The ordering that matters: a prefix match beats a match in the middle of the
 * name. Someone typing "sec" wants Sector 31, not Electronic City — even though
 * both contain the letters.
 */
function scoreOne(locality: Locality, q: string): number {
  const name = normalize(locality.name);
  const slug = normalize(locality.slug);
  const city = normalize(locality.city);
  const pincode = locality.pincode ?? "";

  if (name === q || slug === q) return 100;
  if (name.startsWith(q) || slug.startsWith(q)) return 80;

  // Pincode is exact-or-prefix only. A pincode is a number people either know or
  // don't; matching it loosely would surface unrelated localities for a digit.
  if (pincode.startsWith(q) && q.length >= 3) return 70;

  if (name.includes(q) || slug.includes(q)) return 50;

  // Misspellings. "Koramangla", "Indranagar", "Marathalli" — people type these
  // names from memory, and a missing letter should not read as "we don't
  // cover it". Only for queries long enough that one wrong letter is a typo
  // rather than a different word, and ranked below every exact match.
  // Never for anything containing a digit: Sector 45 and Sector 46 are one
  // edit apart and are different places, not a typo of each other.
  if (q.length >= 5 && !/\d/.test(q)) {
    const allowed = q.length >= 9 ? 2 : 1;
    if (editDistance(q, name) <= allowed || editDistance(q, slug) <= allowed) return 40;
    // A misspelt beginning of a longer name: "koramang" for Koramangala.
    const head = name.slice(0, q.length);
    if (q.length >= 6 && editDistance(q, head) <= 1) return 35;
  }

  // City matches rank last on purpose. Typing "bangalore" should list Bengaluru
  // localities, but any locality whose own name matched should still come first.
  if (city.startsWith(q)) return 20;
  const aliases = CITY_ALIASES[locality.city] ?? [];
  if (aliases.some((alias) => alias.startsWith(q))) return 20;

  return 0;
}

/**
 * Filter and rank localities for a query.
 *
 * An empty query returns everything, unranked — the page's default state is the
 * full browsable list, not an empty search result.
 */
export function searchLocalities(
  localities: Locality[],
  query: string,
): Locality[] {
  const q = normalize(query);
  if (!q) return localities;

  const scored: Scored[] = [];
  for (const locality of localities) {
    const score = scoreOne(locality, q);
    if (score > 0) scored.push({ locality, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Stable, predictable tie-break so the list doesn't reshuffle as you type.
    return a.locality.name.localeCompare(b.locality.name);
  });

  return scored.map((s) => s.locality);
}

/**
 * Levenshtein distance, with an early exit once it exceeds anything we accept.
 * Names are short and the list is a few hundred long, so this runs per
 * keystroke without any noticeable cost.
 */
export function editDistance(a: string, b: string, cap = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, curr[j]);
    }
    if (rowMin > cap) return cap + 1;
    prev = curr;
  }
  return prev[b.length];
}

/** A complete six-digit Indian pincode, with or without a space. */
export function looksLikePincode(query: string): boolean {
  return /^\d{3}\s?\d{3}$/.test(query.trim());
}

/** How far a looked-up place may be from a locality before we stop claiming it. */
export const NEARBY_MAX_KM = 8;

/**
 * The covered localities closest to a point, nearest first.
 *
 * Used when someone types a place we do not hold as a locality — a pincode, an
 * apartment, a tech park, a road — and it has been placed on the map. Returning
 * a few rather than one matters: "Manyata Tech Park" sits 1.2 km from both
 * Thanisandra and Nagavara, and choosing between them is the reader's call.
 */
export function nearbyLocalities<T extends Locality>(
  localities: T[],
  lat: number,
  lon: number,
  limit = 3,
  maxKm = NEARBY_MAX_KM,
): Array<{ locality: T; km: number }> {
  const out: Array<{ locality: T; km: number }> = [];
  for (const locality of localities) {
    if (!locality.lat || !locality.lon) continue;
    out.push({ locality, km: greatCircleKm(lat, lon, locality.lat, locality.lon) });
  }
  out.sort((a, b) => a.km - b.km);
  return out.filter((entry) => entry.km <= maxKm).slice(0, limit);
}

/** The single nearest locality at any distance, for saying how far away we are. */
export function nearestAnyDistance<T extends Locality>(
  localities: T[],
  lat: number,
  lon: number,
): { locality: T; km: number } | null {
  return nearbyLocalities(localities, lat, lon, 1, Infinity)[0] ?? null;
}

function greatCircleKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}
