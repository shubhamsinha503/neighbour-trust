/**
 * Service worker.
 *
 * Deliberately minimal, and deliberately not a cache of report pages.
 *
 * This product's whole claim is that every number says how old it is. A service
 * worker that served yesterday's air quality reading from cache would break that
 * claim in the one place it matters most — the reading would look current, the
 * "last updated" line would be whatever was cached alongside it, and nothing on
 * screen would say the page came from disk. So report and API responses are
 * always fetched from the network.
 *
 * What it does instead is make the app installable and give it an honest offline
 * state: a page saying the device is offline, rather than the browser's dinosaur.
 * An installable PWA needs a fetch handler to qualify, and a Trusted Web Activity
 * on the Play Store needs the PWA.
 */

const VERSION = "v1";
const SHELL_CACHE = `neighbour-trust-shell-${VERSION}`;
const OFFLINE_URL = "/offline";

// The minimum needed to render the offline page. Not the app.
const SHELL = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      // Take over as soon as installed rather than waiting for every tab to
      // close, so a fix ships on the next visit instead of the next session.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("neighbour-trust-") && key !== SHELL_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only navigations are handled. Everything else — data, scripts, images —
  // goes straight to the network untouched, which keeps stale data off the page
  // by construction rather than by remembering to exclude the right URLs.
  if (request.mode !== "navigate") return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(SHELL_CACHE);
      const offline = await cache.match(OFFLINE_URL);
      return (
        offline ??
        new Response("You are offline.", {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        })
      );
    }),
  );
});
