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
    <p className="mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-muted">
      <span aria-hidden="true">👥</span>
      {/* Indian grouping: 12,384 → 12,384; 1234567 → 12,34,567. */}
      {total.toLocaleString("en-IN")} visitors and counting
    </p>
  );
}
