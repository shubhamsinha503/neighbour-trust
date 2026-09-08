/**
 * How the site describes what a Trust Score was built from.
 *
 * One implementation, shared, because there were two and they disagreed in
 * public. The locality page derived the list from the report ("Based on
 * schools, safety, water and connectivity"); the search card hardcoded the
 * string "air+schools" — accurate when it was written, and wrong on nearly
 * every card once safety and connectivity started counting. Yelahanka's chip
 * claimed air quality was behind its score while Yelahanka has no air quality
 * data at all.
 *
 * On a product whose whole claim is showing its work, two of its own pages
 * contradicting each other about how the number was built is worse than any
 * gap in the data.
 */

/** Total categories a report can draw on. Kept in step with
 * agents/orchestrator/agent.REPORT_CATEGORIES — power has no card. */
export const TOTAL_CATEGORIES = 5;

/**
 * "schools, safety and connectivity" — for prose, where there is room to name
 * every category the number actually rests on.
 */
export function joinCategoryLabels(labels: string[]): string {
  const lower = labels.map((l) => l.toLowerCase());
  if (lower.length === 0) return "";
  if (lower.length === 1) return lower[0];
  return lower.slice(0, -1).join(", ") + " and " + lower[lower.length - 1];
}

/**
 * "4 of 5 categories" — for the search card, where the full list does not fit
 * at 8.5px and a truncated list would be a new way of being wrong.
 *
 * A count cannot misname a category, and the full list is one tap away on the
 * locality page and in this element's tooltip.
 */
export function categoryCoverageLabel(labels: string[]): string {
  return `${labels.length} of ${TOTAL_CATEGORIES} categories`;
}
