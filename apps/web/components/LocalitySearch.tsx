"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import type { LocalitySummary } from "@/lib/api";
import {
  categoryCoverageLabel,
  joinCategoryLabels,
} from "@/lib/categories";
import { browseList, citiesOf, coverageOf } from "@/lib/ordering";
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
  belowInput,
}: {
  localities: LocalitySummary[];
  /** Rendered between the input and the results, and hidden while searching.
   *
   * A slot rather than a second component under this one: the results list is
   * forty-four cards long, so anything appended after this component lands
   * below all of them, off the bottom of a phone screen. Someone typing has
   * already chosen their route, so whatever sits here steps out of the way. */
  belowInput?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  // Held in memory only. app/privacy/page.tsx states that nothing is written to
  // your browser, and a remembered city preference in localStorage would make
  // that false for the sake of saving one tap.
  const [city, setCity] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cities = useMemo(() => citiesOf(localities), [localities]);
  const searching = query.trim().length > 0;

  // A typed name beats a city chip: someone who searched "koramangala" with
  // Gurugram selected wants Koramangala, not an empty list.
  const results = useMemo(
    () =>
      searching
        ? (searchLocalities(localities, query) as LocalitySummary[])
        : browseList(localities, city),
    [localities, query, city, searching],
  );

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

      {/* City first, because it halves the list before anyone reads a name.
        * With 44 entries that is a convenience; as coverage grows it is the
        * difference between a usable index and a scroll — someone in Gurugram
        * should not pass 28 Bengaluru names to reach their own. Hidden while
        * searching, where it would only contradict the results. */}
      {!searching && cities.length > 1 && (
        <div className="mt-3 flex gap-1.5" role="group" aria-label="Filter by city">
          {[null, ...cities].map((option) => {
            const active = city === option;
            return (
              <button
                key={option ?? "all"}
                type="button"
                onClick={() => setCity(option)}
                aria-pressed={active}
                className={
                  "rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors " +
                  (active
                    ? "bg-brand text-white"
                    : "border border-hairline bg-surface-1 text-ink-secondary hover:border-brand")
                }
              >
                {option ?? "All"}
              </button>
            );
          })}
        </div>
      )}

      <p className="mt-2 px-1 text-[11.5px] text-ink-muted" aria-live="polite">
        {searching
          ? results.length === 0
            ? `Nothing matches “${query.trim()}”`
            : `${results.length} of ${localities.length}`
          : `${results.length} ${results.length === 1 ? "locality" : "localities"}`
            + (city ? ` in ${city}` : ` across ${cities.join(" and ")}`)
            + " · best documented first"}
      </p>

      {!searching && belowInput}

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

      {/* What the number is, said once, where it is first seen.
        *
        * The index showed a green 87 next to a name and never explained it —
        * not what it measures, not out of what, not how complete it is. A
        * reader was left to assume, and the most natural assumption ("someone
        * rated this neighbourhood 87") is the one thing it is not. */}
      {!searching && results.length > 0 && (
        <p className="mt-3 px-1 text-[11px] leading-[1.5] text-ink-muted">
          The score is out of 100, built from up to five categories — schools,
          safety, air quality, water and connectivity. Each card says how many
          it actually rests on, because that varies by locality.
        </p>
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
      <ScoreChip
        score={locality.score}
        scoredCategories={locality.scoredCategories}
      />

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
            {/* Deliberately no longer a count. This read "3 categories of
              * data" beside a chip reading "2 of 5 categories" — two different
              * true statements (how many hold data, how many fed the score)
              * worded almost identically, on the same card, disagreeing at a
              * glance. The chip owns the counting now; this says the one thing
              * it cannot, which is that we found nothing to warn about. */}
            {locality.categoriesWithData > 0
              ? "Nothing flagged here"
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
function ScoreChip({
  score,
  scoredCategories,
}: {
  score: number | null;
  scoredCategories: string[];
}) {
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
            : `Trust Score ${score} of 100, from ${
                joinCategoryLabels(scoredCategories) || "partial data"
              }`
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
        * local press" and reads as though the 95 had weighed it. A confident
        * figure next to a contradicting flag, with nothing reconciling them, is
        * worse than either alone.
        *
        * This read "air+schools", hardcoded. True when written, and false on
        * almost every card by the time anyone noticed: safety and connectivity
        * now count for 41 of 44 localities, and Yelahanka's chip was naming air
        * quality — which Yelahanka has none of. The count comes from the report
        * itself now, and a count is the one form that cannot misname a
        * category. The full list is in the tooltip and on the locality page. */}
      {score !== null && (
        <span
          // The caveat gets louder exactly when it matters. A score resting on
          // two categories is a far weaker claim than one resting on five, and
          // in identical grey type the reader has no reason to notice the
          // difference — they see two confident numbers side by side.
          className={
            "text-[8.5px] leading-none " +
            (scoredCategories.length <= 2
              ? "font-semibold text-[#c9860a]"
              : "text-ink-muted")
          }
          title={joinCategoryLabels(scoredCategories)}
        >
          {categoryCoverageLabel(scoredCategories)}
        </span>
      )}
    </div>
  );
}
