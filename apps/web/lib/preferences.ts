/**
 * Functional preferences, remembered in first-party cookies.
 *
 * These exist for one reason: to save you a tap on your next visit — the city
 * filter you last chose, so the front page opens where you left off. A
 * preference cookie holds only the preference itself ("show me Hyderabad
 * first"), is never sent to anyone else, and identifies no one — it is not a
 * profile and not a tracker.
 *
 * This is a deliberate reversal of an earlier stance: the app used to write
 * nothing to the browser for signed-out visitors and said so on the privacy
 * page. Because the whole product's claim is that it does not overstate, the
 * rule is absolute — **any preference cookie named here must be described in
 * app/privacy/page.tsx in the same commit that adds it.** A cookie that the
 * policy does not mention is the one failure this product exists to avoid.
 *
 * A first-party cookie rather than localStorage so the server can read the
 * choice while rendering and paint the right city on the first frame (no
 * flash), matching how the rest of the app pre-fills from the request.
 */

/** Remembers the city filter last selected in the search box. */
export const PREF_CITY_COOKIE = "nt_city";

// One year: long enough to survive the gap between house-hunting sessions,
// which is measured in weeks. `SameSite=Lax` so it is never sent on a
// cross-site request; not `HttpOnly`, because the client both sets and reads it.
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Write a preference cookie from the browser. A no-op on the server. */
export function writePref(name: string, value: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=lax`;
}

/** Remove a preference cookie from the browser. A no-op on the server. */
export function clearPref(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}
