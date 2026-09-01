/**
 * Matching locality names the way people actually type them.
 *
 * The list is 44 entries, so this runs in the browser over data the page already
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
