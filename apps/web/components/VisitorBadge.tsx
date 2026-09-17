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
    <p className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12px] font-medium text-ink-muted">
      <span aria-hidden="true">👥</span>
      {/* Indian grouping: 12,384 → 12,384; 1234567 → 12,34,567. */}
      <span>{total.toLocaleString("en-IN")} page views</span>
      {/* The one handwritten flourish on the site: a crisp number, then a
        * cursive aside. The number stays legible; the personality lives in the
        * tag. Caveat is loaded in the root layout as var(--font-caveat). */}
      <span
        className="-ml-0.5 inline-block text-brand"
        style={{
          fontFamily: "var(--font-caveat), cursive",
          fontSize: "16px",
          lineHeight: 1,
          transform: "rotate(-4deg)",
        }}
      >
        and counting
      </span>
    </p>
  );
}
