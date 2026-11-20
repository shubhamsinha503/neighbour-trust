"use client";

import { useEffect, useRef } from "react";

import "@/app/opening.css";
import { mountOpening } from "@/lib/opening/driver";
import { OPENING_HTML } from "@/lib/opening/markup";

/**
 * The homepage opening: a miniature neighbourhood, pinned, that the scroll takes
 * from afternoon to night to morning. Each signal Nestra reads (connectivity,
 * schools, green space, air, who lives here, lived experience, water) arrives as
 * something the place itself does when the light changes; it ends on the brand
 * and a search field that hands the query to the real search below.
 *
 * The SVG is pre-rendered (lib/opening/markup) so server and client HTML match;
 * the driver (lib/opening/driver) only moves CSS numbers from the scroll.
 */
export function Opening() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (!host) return;

    const stop = mountOpening(host);

    // Hand the typed query to the site's real search, which sits below the
    // opening. Scroll to it, copy the text across (via the native value setter so
    // React's controlled input registers the change), and focus it.
    const form = host.querySelector<HTMLFormElement>(".op-find");
    const onSubmit = (e: Event) => {
      e.preventDefault();
      const input = form?.querySelector<HTMLInputElement>("input");
      const q = input?.value.trim() ?? "";
      if (!q) {
        input?.focus();
        return;
      }
      const target = document.getElementById("nestra-search");
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      const real = target.querySelector<HTMLInputElement>('input[type="search"], input');
      if (!real) return;
      try {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )?.set;
        setter?.call(real, q);
        real.dispatchEvent(new Event("input", { bubbles: true }));
      } catch {
        /* value hand-off is a nicety; focus below still lands the user */
      }
      window.setTimeout(() => real.focus(), 450);
    };
    form?.addEventListener("submit", onSubmit);

    return () => {
      stop();
      form?.removeEventListener("submit", onSubmit);
    };
  }, []);

  return (
    <section
      ref={ref}
      className="op"
      data-stage="0"
      aria-label="How Nestra reads a neighbourhood"
      dangerouslySetInnerHTML={{ __html: OPENING_HTML }}
    />
  );
}
