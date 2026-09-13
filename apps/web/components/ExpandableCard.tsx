"use client";

/**
 * A category card that keeps its explanation folded until it is asked for.
 *
 * The grid is read at a glance — name, score, bar — and four paragraphs of
 * detail under four scores made the page read as a wall of text. The detail is
 * still one tap away, on the same screen, rather than behind a navigation.
 *
 * The header is a real <button> with aria-expanded, so the fold works from a
 * keyboard and is announced by a screen reader. The footer sits outside the
 * button because it can hold a link, and a link nested inside a button is
 * invalid and unreliable to tap.
 */

import { useId, useState, type ReactNode } from "react";

export function ExpandableCard({
  className,
  header,
  detail,
  footer,
}: {
  className: string;
  header: ReactNode;
  detail: ReactNode;
  footer: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const detailId = useId();

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={detailId}
        className="block w-full cursor-pointer text-left"
      >
        {header}
      </button>

      <div id={detailId} hidden={!open}>
        {detail}
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2">
        {footer}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={detailId}
          className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium text-ink-muted hover:text-ink-secondary"
        >
          {open ? "Less" : "More"}
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden="true"
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
