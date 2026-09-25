import { cookies } from "next/headers";

import { fetchVisitorPrefCity } from "@/lib/api";
import { PREF_CITY_COOKIE, VISITOR_COOKIE } from "@/lib/preferences";

/**
 * The city preference to open a page with, resolved on the server so it paints
 * on the first frame with no flash. Used by both the home page and the
 * localities list so the two can never disagree about what "your city" is.
 *
 * A consented visitor's server-side profile wins — it is the copy that other
 * entry points update — and the local functional cookie is the fallback for
 * anyone who has not opted in. A stored value naming a city we no longer carry
 * is dropped rather than shown as an empty list, which is why the caller passes
 * in the set of cities that currently exist.
 */
export async function readSavedCity(
  knownCities: Set<string>,
): Promise<string | null> {
  const store = await cookies();
  const visitorId = store.get(VISITOR_COOKIE)?.value ?? null;
  const saved =
    (visitorId ? await fetchVisitorPrefCity(visitorId) : null) ??
    store.get(PREF_CITY_COOKIE)?.value ??
    null;
  return saved && knownCities.has(saved) ? saved : null;
}
