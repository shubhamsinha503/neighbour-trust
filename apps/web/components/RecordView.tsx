"use client";

/**
 * Adds this locality to a consented visitor's view history.
 *
 * A client effect rather than a write during the page's server render, so the
 * report stays cacheable at the edge and a prefetch or a crawler never counts
 * as a view — only a page a person actually has open does. It checks consent
 * before sending anything; /api/views checks it again on the server.
 */

import { useEffect } from "react";

import { readConsent } from "@/lib/preferences";

export function RecordView({ slug }: { slug: string }) {
  useEffect(() => {
    if (readConsent() !== "granted") return;
    void fetch("/api/views", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug }),
      keepalive: true,
    }).catch(() => {});
  }, [slug]);

  return null;
}
