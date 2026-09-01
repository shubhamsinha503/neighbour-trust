"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import type { Locality } from "@/lib/api";
import { searchLocalities } from "@/lib/search";

/**
 * Search over the locality list.
 *
 * Filters in the browser rather than calling an endpoint. At 44 localities the
 * whole list is already on the page, so a round-trip would add latency and a
 * loading state to something that can be instant — and typing is exactly where
 * latency is felt most.
 *
 * The server renders the complete grid inside this component, so with
 * JavaScript unavailable the page is still a working directory of every
 * locality; search is an enhancement on top rather than the only way in.
 */
export function LocalitySearch({ localities }: { localities: Locality[] }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(
    () => searchLocalities(localities, query),
    [localities, query],
  );

  const searching = query.trim().length > 0;
  const grouped = useMemo(() => groupByCity(results), [results]);

  return (
    <div>
      <div className="relative mt-6">
        <svg
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
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
          placeholder="Search a locality, city or pincode"
          aria-label="Search localities"
          className="w-full rounded-2xl border border-hairline bg-surface-1 py-3 pl-10 pr-4 text-[13px] outline-none transition-colors placeholder:text-ink-muted focus:border-brand"
          // Indian locality names are proper nouns the browser does not know;
          // autocorrect turns "Hoodi" into "Hoodie" mid-keystroke.
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </div>

      {searching && (
        <p className="mt-2.5 text-[11.5px] text-ink-muted" aria-live="polite">
          {results.length === 0
            ? `Nothing matches “${query.trim()}”`
            : `${results.length} of ${localities.length} localities`}
        </p>
      )}

      {results.length === 0 && searching && (
        <div className="mt-4 rounded-2xl border border-hairline bg-surface-1 p-5">
          <p className="text-[13px] font-semibold">
            We don&apos;t cover that one yet
          </p>
          <p className="mt-1.5 text-[12px] leading-[1.55] text-ink-secondary">
            Neighbour Trust currently covers {localities.length} localities across
            Bengaluru and Gurugram. We add areas where we can source data we
            trust, rather than filling the map with estimates.
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

      {Object.entries(grouped).map(([city, entries]) => (
        <section key={city} className="mt-7">
          <h2 className="mb-3 text-[11.5px] font-bold uppercase tracking-[0.05em] text-ink-secondary">
            {city}
            <span className="ml-1.5 font-medium text-ink-muted">
              {entries.length}
            </span>
          </h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {entries.map((locality) => (
              <Link
                key={locality.slug}
                href={`/${locality.slug}`}
                className="rounded-2xl border border-hairline bg-surface-1 p-3.5 transition-colors hover:border-brand"
              >
                <div className="text-[13px] font-semibold">{locality.name}</div>
                <div className="mt-0.5 text-[11px] text-ink-muted">
                  {locality.pincode ?? locality.state}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function groupByCity(localities: Locality[]): Record<string, Locality[]> {
  return localities.reduce<Record<string, Locality[]>>((acc, locality) => {
    (acc[locality.city] ??= []).push(locality);
    return acc;
  }, {});
}
