"use client";

import { useEffect } from "react";

/**
 * Registers the service worker.
 *
 * A client component with no markup, mounted once from the root layout. The
 * worker itself is a static file in public/ rather than something bundled,
 * because it has to be served from the origin root to control every route.
 *
 * Registration failures are swallowed on purpose: the worker only provides an
 * offline page and installability, so a browser that refuses it should still
 * get a working site rather than an error.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Private browsing, an unsupported browser, or a blocked scope.
      });
    };

    // After load, so registration never competes with the first paint.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
