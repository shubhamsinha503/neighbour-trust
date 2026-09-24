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

/** Remembers the city filter last selected in the search box (functional, local). */
export const PREF_CITY_COOKIE = "nt_city";

/**
 * The consented layer, on top of the functional cookie above.
 *
 * `nt_consent` ("granted" | "denied") is JS-readable so the banner knows whether
 * it has already been answered. `nt_visitor` is the opaque per-person id and is
 * set HttpOnly by the server (app/api/consent), so it is deliberately NOT
 * readable here — the client never sees the identifier, it only knows whether
 * consent was given. Both are described on the privacy page.
 */
export const CONSENT_COOKIE = "nt_consent";
export const VISITOR_COOKIE = "nt_visitor";

export type Consent = "granted" | "denied" | null;

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

/** Whether the visitor has answered the personalisation banner, and how. */
export function readConsent(): Consent {
  const v = readCookie(CONSENT_COOKIE);
  return v === "granted" || v === "denied" ? v : null;
}

/**
 * Save the city preference. Always writes the local functional cookie (fast,
 * needs no consent); if the visitor has consented to personalisation, also
 * persists it server-side against their id via the web app's own route, so it
 * follows them to another device. Fires and forgets — a preference save is never
 * allowed to block or break the tap that triggered it.
 */
export function saveCityPreference(city: string | null): void {
  if (city) writePref(PREF_CITY_COOKIE, city);
  else clearPref(PREF_CITY_COOKIE);

  if (readConsent() === "granted" && typeof fetch !== "undefined") {
    void fetch("/api/prefs", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ city }),
      keepalive: true,
    }).catch(() => {});
  }
}

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
