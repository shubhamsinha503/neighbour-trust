/**
 * What order to show localities in, and how to narrow them to one city.
 *
 * The index was alphabetical, so a first-time visitor met Banashankari,
 * Banaswadi and Basavanagudi — three names that mean nothing unless you already
 * know Bengaluru, chosen by nothing but the alphabet. Nobody learns what the
 * product does from that.
 *
 * **Ordered by how much we can actually tell you, not by score.**
 *
 * Sorting by score would be the obvious move and it is the wrong one. It turns
 * the index into a league table of neighbourhoods — and these scores are built
 * from between two and five categories depending on the locality, so ranking
 * them against each other compares numbers that do not mean the same thing.
 * Basavanagudi scored 93 from two categories and sat above Bellandur on 77 from
 * two; put a 93-from-two above an 84-from-five and the page is actively
 * misleading, because the 84 is the better-evidenced figure.
 *
 * Coverage first is the honest ordering: it leads with the localities where the
 * answer is most complete, which is the product at its most useful and makes no
 * claim about which neighbourhood is *better*. Within the same coverage, names
 * are alphabetical — an arbitrary tie-break, but a stable and unopinionated one.
 */

import type { LocalitySummary } from "@/lib/api";

/** How many categories actually fed this locality's score. */
export function coverageOf(locality: LocalitySummary): number {
  return locality.scoredCategories?.length ?? 0;
}

/**
 * Best-documented first, then alphabetical.
 *
 * Deliberately not score-ordered — see the note above. A locality with no score
 * at all sorts last rather than as a zero, for the same reason the card renders
 * an em dash: "we cannot say" and "scores badly" are different statements.
 */
export function byCoverageThenName(a: LocalitySummary, b: LocalitySummary): number {
  const coverage = coverageOf(b) - coverageOf(a);
  if (coverage !== 0) return coverage;
  return a.name.localeCompare(b.name);
}

/** Every city present, in a stable order. */
export function citiesOf(localities: LocalitySummary[]): string[] {
  return [...new Set(localities.map((l) => l.city))].sort();
}

/** `city` of null means all of them. */
export function filterByCity(
  localities: LocalitySummary[],
  city: string | null,
): LocalitySummary[] {
  return city === null ? localities : localities.filter((l) => l.city === city);
}

/**
 * The browse list: one city's worth, best-documented first.
 *
 * Search deliberately does not go through here. Someone who types a name has
 * told us exactly what they want, and hiding it because a city chip is set the
 * other way would be obstinate — a query is a stronger signal than a filter.
 */
export function browseList(
  localities: LocalitySummary[],
  city: string | null,
): LocalitySummary[] {
  return [...filterByCity(localities, city)].sort(byCoverageThenName);
}
