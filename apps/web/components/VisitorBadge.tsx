"use client";

import { useEffect, useState } from "react";

/**
 * The "N and counting" badge under the coverage line.
 *
 * The page paints the count the server read (`initial`), so there is no empty
 * flash and the number is right without waiting on JavaScript. On mount this
 * records the view and shows the total it comes back with — so a visitor sees
 * the figure move to include their own visit, which is the whole appeal of a
 * counter.
 *
 * Everything here fails soft. If the record call does not answer, the badge
 * keeps the number it rendered with; a visit counter is never a reason for the
 * front page to show less than it did.
 */
export function VisitorBadge({ initial }: { initial: number }) {
  const [total, setTotal] = useState(initial);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/visit", { method: "POST" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.total === "number") {
          setTotal(data.total);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <p className="inline-flex shrink-0 items-baseline gap-x-2 whitespace-nowrap">
      <span aria-hidden="true" className="self-center text-[17px]">
        👥
      </span>
      {/* The number leads, big and crisp in the display face. Indian grouping:
        * 12,384 → 12,384; 1234567 → 12,34,567. */}
      <span className="font-display font-bold leading-none tracking-[-0.02em] text-ink-primary text-[clamp(22px,5.5vw,30px)]">
        {total.toLocaleString("en-IN")}
      </span>
      <span className="text-[clamp(13px,2.4vw,15px)] font-medium text-ink-secondary">
        page views
      </span>
      {/* The one handwritten flourish on the site: a cursive aside in the brand
        * colour. Caveat is loaded in the root layout as var(--font-caveat). */}
      <span
        className="inline-block text-brand"
        style={{
          fontFamily: "var(--font-caveat), cursive",
          fontSize: "clamp(24px, 6vw, 34px)",
          lineHeight: 1,
          transform: "rotate(-4deg)",
        }}
      >
        and counting
      </span>
    </p>
  );
}
