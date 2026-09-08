/**
 * Vercel Web Analytics — page views, referrers and top pages.
 *
 * Loaded as the script Vercel serves at a fixed path rather than through the
 * `@vercel/analytics` package. The package declares optional peer dependencies
 * for Svelte tooling that npm resolves against Vite 8, which conflicts with the
 * Vite 7 this app's test runner pins; the install fails outright. The script is
 * the same collector without that argument, and this app has three runtime
 * dependencies in total, so not adding a fourth to work around a resolver is
 * the better trade here.
 *
 * **It is cookieless and stores nothing in the browser.** That is the reason it
 * was chosen over Google Analytics: no consent banner, and app/privacy/page.tsx
 * can keep saying the site sets no cookies and can't identify a reader. If this
 * is ever swapped for something that does set cookies or assign a persistent
 * id, that page has to change in the same commit — the rule is written in its
 * own docstring, and it has been broken once already.
 *
 * The path 404s until Web Analytics is switched on for the project in the
 * Vercel dashboard. A missing script is inert: nothing renders differently and
 * no error reaches the reader.
 */
import Script from "next/script";

// Served by Vercel's edge alongside the deployment. Not a third-party origin,
// so no DNS lookup to anyone else and nothing for a blocker to treat as a
// tracker call to another domain.
const SCRIPT_SRC = "/_vercel/insights/script.js";

export function WebAnalytics() {
  // Only in production. In development the endpoint does not exist, and a local
  // page reload should never look like a visitor in the numbers.
  if (process.env.NODE_ENV !== "production") return null;

  return <Script src={SCRIPT_SRC} strategy="afterInteractive" defer />;
}
