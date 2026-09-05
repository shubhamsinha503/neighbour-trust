"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import type { LocalitySummary } from "@/lib/api";
import { searchLocalities } from "@/lib/search";

/**
 * Search over the localities, answering rather than listing.
 *
 * The earlier version was a directory: forty-four name cards, and you clicked
 * one to find out anything. Someone arrives having already decided which
 * neighbourhood they care about, so the result should tell them what the place
 * is like, not offer them a menu.
 *
 * Each result therefore carries its score and its most serious flag — the same
 * two things the report page leads with, so the answer starts here and the click
 * is for the evidence behind it.
 *
 * Filtering runs in the browser over data the page already has. At 44 entries a
 * round-trip would add latency and a loading state to something that can be
 * instant, and typing is where latency is felt most. The server renders the full
 * list inside this component, so the page is still a working directory without
 * JavaScript.
 */
export function LocalitySearch({
  localities,
}: {
  localities: LocalitySummary[];
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () => searchLocalities(localities, query) as LocalitySummary[],
    [localities, query],
  );
  const searching = query.trim().length > 0;

  return (
    <div>
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-muted"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" strokeLinecap="round" />
        </svg>

        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setQuery("");
          }}
          placeholder="Search your locality"
          aria-label="Search localities"
          className="w-full rounded-2xl border-[1.5px] border-hairline bg-surface-1 py-4 pl-12 pr-4 text-[15px] outline-none transition-colors placeholder:text-ink-muted focus:border-brand"
          // Indian locality names are proper nouns the browser does not know;
          // autocorrect turns "Hoodi" into "Hoodie" mid-keystroke.
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>

      <p className="mt-2 px-1 text-[11.5px] text-ink-muted" aria-live="polite">
        {searching
          ? results.length === 0
            ? `Nothing matches “${query.trim()}”`
            : `${results.length} of ${localities.length}`
          : `${localities.length} localities across Bengaluru and Gurugram`}
      </p>

      {searching && results.length === 0 && (
        <div className="mt-3 rounded-2xl border border-hairline bg-surface-1 p-5">
          <p className="text-[13px] font-semibold">
            We don&apos;t cover that one yet
          </p>
          <p className="mt-1.5 text-[12px] leading-[1.55] text-ink-secondary">
            We add areas where we can source data we trust, rather than filling
            the map with estimates.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="mt-3 text-[12px] font-semibold text-brand hover:underline"
          >
            Show all localities
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {results.map((locality) => (
          <ResultRow key={locality.slug} locality={locality} />
        ))}
      </div>
    </div>
  );
}

/** One locality, answering the question rather than pointing at the answer. */
function ResultRow({ locality }: { locality: LocalitySummary }) {
  const flag = locality.topFlag;

  return (
    <Link
      href={`/${locality.slug}`}
      className="flex items-start gap-3 rounded-2xl border border-hairline bg-surface-1 p-3.5 transition-colors hover:border-brand"
    >
      <ScoreChip score={locality.score} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[14px] font-semibold">{locality.name}</span>
          <span className="text-[11px] text-ink-muted">{locality.city}</span>
        </div>

        {flag ? (
          <p className="mt-1 flex items-start gap-1.5 text-[11.5px] leading-[1.45] text-ink-secondary">
            <span
              aria-hidden="true"
              className={
                flag.severity === "serious"
                  ? "mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#c0442c]"
                  : "mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#c9860a]"
              }
            />
            <span className="line-clamp-2">{flag.headline}</span>
          </p>
        ) : (
          <p className="mt-1 text-[11.5px] leading-[1.45] text-ink-muted">
            {locality.categoriesWithData > 0
              ? `${locality.categoriesWithData} categories of data · nothing flagged`
              : "No data yet"}
          </p>
        )}
      </div>
    </Link>
  );
}

/**
 * The score, or an em dash.
 *
 * Never a zero and never blank: "not enough data to score this" is a different
 * statement from "scores badly", and a blank would let a reader supply whichever
 * they expected.
 */
function ScoreChip({ score }: { score: number | null }) {
  const colour =
    score === null
      ? "var(--color-ink-muted)"
      : score >= 75
        ? "var(--color-brand)"
        : score >= 55
          ? "#c9860a"
          : "#c0442c";

  return (
    <div className="flex w-[46px] shrink-0 flex-col items-center gap-1">
      <div
        className="flex h-[42px] w-[42px] items-center justify-center rounded-xl"
        style={{
          background:
            score === null ? "transparent" : `color-mix(in srgb, ${colour} 12%, transparent)`,
          border: score === null ? "1px dashed var(--color-hairline)" : "none",
        }}
        title={
          score === null
            ? "Not enough data for a score"
            : `Trust Score ${score} of 100, from air quality and schools only`
        }
      >
        <span
          className="text-[16px] font-bold leading-none tabular-nums"
          style={{ color: colour }}
        >
          {score ?? "—"}
        </span>
      </div>

      {/* What the number covers, beside the number.
        *
        * Without this a green 95 sits directly next to "Violence reported in
        * local press" and reads as though the 95 had weighed it. It has not:
        * the score is air quality and schools, and safety is deliberately never
        * scored. A confident figure next to a contradicting flag, with nothing
        * reconciling them, is worse than either alone. */}
      {score !== null && (
        <span className="text-[8.5px] leading-none text-ink-muted">air+schools</span>
      )}
    </div>
  );
}
