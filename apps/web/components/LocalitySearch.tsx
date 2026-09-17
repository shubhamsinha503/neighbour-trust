"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import type { LocalitySummary } from "@/lib/api";
import {
  categoryCoverageLabel,
  joinCategoryLabels,
} from "@/lib/categories";
import { browseList, citiesOf, coverageOf } from "@/lib/ordering";
import {
  looksLikePincode,
  nearbyLocalities,
  nearestAnyDistance,
  searchLocalities,
} from "@/lib/search";
import { RequestLocality } from "@/components/RequestLocality";
import { ResultRowSkeleton, SkeletonRegion } from "@/components/Skeleton";

/**
 * The outcome of placing a typed query on the map.
 *
 * Someone may not know which locality they are asking about — they know their
 * pincode, their apartment, the tech park they work in or the road they would
 * live on. Only names we hold can match as they type, so anything else is
 * looked up as a place and answered with the covered localities nearest to it.
 */
type PlaceLookup =
  | { status: "idle" }
  | { status: "loading"; query: string }
  | {
      status: "found";
      query: string;
      label: string;
      lat: number;
      lon: number;
      nearby: Array<{ locality: LocalitySummary; km: number }>;
    }
  | {
      status: "outside";
      query: string;
      label: string;
      lat: number;
      lon: number;
      nearest: { locality: LocalitySummary; km: number } | null;
    }
  | { status: "failed"; query: string; message: string };

async function geocode(
  q: string,
  city?: string | null,
): Promise<{ lat: number; lon: number; label: string } | { error: string }> {
  try {
    const response = await fetch("/api/geocode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ q, city: city ?? undefined }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { error: data?.error ?? "We could not look that up." };
    return data;
  } catch {
    return { error: "We could not look that up. Check your connection." };
  }
}

/** "Starbucks, Phoenix Marketcity Bangalore, Whitefield Main Road, …" → first three parts. */
function shortLabel(label: string): string {
  return label.split(",").slice(0, 3).map((p) => p.trim()).join(", ");
}

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
  showBrowseList = true,
  examples = [],
  autoFocus = false,
  initialCity = null,
}: {
  localities: LocalitySummary[];
  /**
   * Whether the full list shows before anything is typed. The front page turns
   * it off: it is a search, not a directory, and a column of 159 names under
   * the box told a first-time visitor to scroll rather than ask. The browse
   * page keeps it on.
   */
  showBrowseList?: boolean;
  /** Tappable sample queries shown under the box before anything is typed. */
  examples?: string[];
  autoFocus?: boolean;
  /** Opens with this city chip selected, e.g. from a city tile on the front page. */
  initialCity?: string | null;
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
  const [city, setCity] = useState<string | null>(initialCity);
  const inputRef = useRef<HTMLInputElement>(null);
  const [place, setPlace] = useState<PlaceLookup>({ status: "idle" });
  // Each lookup takes a number; only the latest may write its result. A slow
  // lookup for "560024" must not land under a query that has since become
  // "Hebbal".
  const lookupSeq = useRef(0);

  const cities = useMemo(() => citiesOf(localities), [localities]);
  const searching = query.trim().length > 0;

  /**
   * Look the query up as a place and list the localities nearest to it.
   *
   * Only ever on an explicit action — Enter, the button, or a completed
   * six-digit pincode — never per keystroke: the lookup service's usage policy
   * forbids autocomplete, and a finished pincode is as deliberate as pressing
   * Enter.
   *
   * With no city chosen the place is looked up across India first, then biased
   * to each launch city in turn if it landed somewhere we do not cover. "Phoenix
   * Marketcity" exists in several cities; the one worth answering is ours.
   */
  async function lookUp(raw: string) {
    const q = raw.trim();
    if (q.length < 3) return;
    const seq = ++lookupSeq.current;
    const current = () => seq === lookupSeq.current;
    setPlace({ status: "loading", query: q });

    const attempts: Array<string | null> = city ? [city] : [null, ...cities];
    let lastFound: { lat: number; lon: number; label: string } | null = null;
    let lastError = "We could not find that place.";

    for (const attemptCity of attempts) {
      const result = await geocode(q, attemptCity);
      if (!current()) return;
      if ("error" in result) {
        lastError = result.error;
        continue;
      }
      lastFound = result;
      const nearby = nearbyLocalities(localities, result.lat, result.lon);
      if (nearby.length > 0) {
        setPlace({ status: "found", query: q, label: shortLabel(result.label), lat: result.lat, lon: result.lon, nearby });
        return;
      }
    }

    if (!current()) return;
    if (lastFound) {
      setPlace({
        status: "outside",
        query: q,
        label: shortLabel(lastFound.label),
        lat: lastFound.lat,
        lon: lastFound.lon,
        nearest: nearestAnyDistance(localities, lastFound.lat, lastFound.lon),
      });
    } else {
      setPlace({ status: "failed", query: q, message: lastError });
    }
  }

  function onQueryChange(value: string) {
    setQuery(value);
    // A result for an earlier query must not sit under a different one.
    if (place.status !== "idle" && place.query !== value.trim()) {
      lookupSeq.current++;
      setPlace({ status: "idle" });
    }
    // A finished pincode that none of our localities carry is looked up at
    // once: most localities have no pincode stored, and a pincode is the one
    // thing nearly everyone knows about where they live.
    if (looksLikePincode(value)) {
      const digits = value.replace(/\s/g, "");
      const known = localities.some((l) => (l.pincode ?? "") === digits);
      if (!known) void lookUp(digits);
    }
  }

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
      <form
        role="search"
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          void lookUp(query);
        }}
      >
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
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onQueryChange("");
            // Handled here as well as by the form, and the default prevented so
            // it runs once: some Android keyboards' "Go" key and IME setups do
            // not reliably trigger a form's implicit submission. Ignored while
            // an IME is composing, where Enter confirms a word, not the search.
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void lookUp(query);
            }
          }}
          placeholder="Locality, pincode, apartment, road or landmark"
          aria-label="Search by locality, pincode, apartment, road or landmark"
          enterKeyHint="search"
          className="w-full rounded-2xl border-[1.5px] border-hairline bg-surface-1 py-4 pl-12 pr-4 text-[15px] outline-none transition-colors placeholder:text-ink-muted focus:border-brand"
          // Indian locality names are proper nouns the browser does not know;
          // autocorrect turns "Hoodi" into "Hoodie" mid-keystroke.
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus={autoFocus}
        />
      </form>

      {/* Sample queries, so the three kinds of thing the box accepts — a name,
        * a pincode, a place — are shown rather than described. */}
      {!searching && examples.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 px-1">
          <span className="text-[11.5px] text-ink-muted">Try</span>
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                onQueryChange(example);
                // A place or pincode is looked up as if Enter were pressed; a
                // locality name already matches as it is typed.
                // (A complete pincode already starts its own lookup on change.)
                if (!looksLikePincode(example) && searchLocalities(localities, example).length === 0) {
                  void lookUp(example);
                }
                inputRef.current?.focus();
              }}
              className="rounded-full border border-hairline bg-surface-1 px-3 py-1 text-[12px] font-medium text-ink-secondary hover:border-brand hover:text-brand"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      {/* City first, because it halves the list before anyone reads a name.
        * With 44 entries that is a convenience; as coverage grows it is the
        * difference between a usable index and a scroll — someone in Gurugram
        * should not pass 28 Bengaluru names to reach their own. Hidden while
        * searching, where it would only contradict the results. */}
      {showBrowseList && !searching && cities.length > 1 && (
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

      {/* No "Nothing matches" once a place lookup is under way or answered: it
        * sat directly above "Nearest to DLF Cyber Hub" and read as a
        * contradiction. The lookup panel says what was found instead. */}
      {(showBrowseList || searching) && !(searching && results.length === 0 && place.status !== "idle") && (
      <p className="mt-2 px-1 text-[11.5px] text-ink-muted" aria-live="polite">
        {searching
          ? results.length === 0
            ? `Nothing matches “${query.trim()}”`
            : `${results.length} of ${localities.length}`
          : `${results.length} ${results.length === 1 ? "locality" : "localities"}`
            + (city ? ` in ${city}` : ` across ${cities.join(" and ")}`)
            + " · best documented first"}
      </p>
      )}

      {!searching && belowInput}

      {/* A typed place, placed on the map. Sits above any name matches, since
        * someone who pressed Enter asked for exactly this. */}
      {searching && place.status !== "idle" && (
        <PlaceResult
          place={place}
          city={city}
          onShowAll={() => {
            onQueryChange("");
            inputRef.current?.focus();
          }}
        />
      )}

      {/* No name matches yet and no lookup asked for: offer one, rather than
        * telling someone we do not cover a place we may well cover under
        * another name. */}
      {searching && results.length === 0 && place.status === "idle" && (
        <div className="mt-3 rounded-2xl border border-hairline bg-surface-1 p-5">
          <p className="text-[13px] font-semibold">
            No locality is called &ldquo;{query.trim()}&rdquo;
          </p>
          <p className="mt-1.5 text-[12px] leading-[1.55] text-ink-secondary">
            If it&apos;s a pincode, apartment, road or landmark, we can find the
            localities nearest to it.
          </p>
          <button
            type="button"
            onClick={() => void lookUp(query)}
            className="mt-3 rounded-xl bg-brand px-4 py-2 text-[12.5px] font-semibold text-white"
          >
            Find localities near &ldquo;{query.trim()}&rdquo;
          </button>
          <RequestLocality context={{ query: query.trim(), city }} />
        </div>
      )}

      {/* Name matches exist, but the reader may mean a place rather than a
        * locality — "Phoenix" matches no name yet is a mall. One quiet line. */}
      {searching && results.length > 0 && place.status === "idle" && query.trim().length >= 3 && (
        <button
          type="button"
          onClick={() => void lookUp(query)}
          className="mt-2 px-1 text-left text-[11.5px] font-medium text-brand hover:underline"
        >
          Not what you meant? Find localities near &ldquo;{query.trim()}&rdquo; →
        </button>
      )}

      {/* What the number is, said once, where it is first seen.
        *
        * The index showed a green 87 next to a name and never explained it —
        * not what it measures, not out of what, not how complete it is. A
        * reader was left to assume, and the most natural assumption ("someone
        * rated this neighbourhood 87") is the one thing it is not. */}
      {(showBrowseList || searching) && results.length > 0 && (
        <p className="mt-3 px-1 text-[11px] leading-[1.5] text-ink-muted">
          The score is out of 100, built from up to five categories — schools,
          safety, air quality, water and connectivity. Each card says how many
          it actually rests on, because that varies by locality.
        </p>
      )}

      {(showBrowseList || searching) && (
        <div className="mt-3 flex flex-col gap-2">
          {results.map((locality) => (
            <ResultRow key={locality.slug} locality={locality} />
          ))}
        </div>
      )}
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

/** What a place lookup found, in the same result rows the name search uses. */
function PlaceResult({
  place,
  city,
  onShowAll,
}: {
  place: Exclude<PlaceLookup, { status: "idle" }>;
  city: string | null;
  onShowAll: () => void;
}) {
  if (place.status === "loading") {
    return (
      <SkeletonRegion label={`Finding ${place.query} on the map`}>
        <p className="mt-3 px-1 text-[12px] text-ink-secondary">
          <span aria-hidden="true">📍 </span>
          Finding &ldquo;{place.query}&rdquo; on the map…
        </p>
        <div className="mt-2 flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <ResultRowSkeleton key={i} />
          ))}
        </div>
      </SkeletonRegion>
    );
  }

  if (place.status === "failed") {
    return (
      <div className="mt-3 rounded-2xl border border-hairline bg-surface-1 p-5" aria-live="polite">
        <p className="text-[13px] font-semibold">
          We couldn&apos;t find &ldquo;{place.query}&rdquo;
        </p>
        <p className="mt-1.5 text-[12px] leading-[1.55] text-ink-secondary">
          {place.message} Try a pincode, a nearby landmark, or the name of the
          road.
        </p>
        <RequestLocality context={{ query: place.query, city }} />
        <button
          type="button"
          onClick={onShowAll}
          className="mt-3 text-[12px] font-semibold text-brand hover:underline"
        >
          Show all localities
        </button>
      </div>
    );
  }

  if (place.status === "outside") {
    return (
      <div className="mt-3 rounded-2xl border border-hairline bg-surface-1 p-5" aria-live="polite">
        <p className="text-[13px] font-semibold">
          {place.label} is outside the areas we cover
        </p>
        <p className="mt-1.5 text-[12px] leading-[1.55] text-ink-secondary">
          {place.nearest
            ? `The closest locality we cover is ${place.nearest.locality.name}, ${place.nearest.locality.city} — ${formatKm(place.nearest.km)} away.`
            : "We cover parts of Bengaluru, Gurugram, Hyderabad and Mumbai so far."}
        </p>
        <RequestLocality
          context={{
            query: place.query,
            city,
            placeLabel: place.label,
            lat: place.lat,
            lon: place.lon,
            nearestSlug: place.nearest?.locality.slug,
            nearestKm: place.nearest?.km,
          }}
        />
        <button
          type="button"
          onClick={onShowAll}
          className="mt-3 text-[12px] font-semibold text-brand hover:underline"
        >
          Show all localities
        </button>
      </div>
    );
  }

  return (
    <section className="mt-3" aria-live="polite">
      <p className="px-1 text-[12px] text-ink-secondary">
        <span aria-hidden="true">📍 </span>
        Nearest to <span className="font-semibold text-ink-primary">{place.label}</span>
      </p>
      <div className="mt-2 flex flex-col gap-2">
        {place.nearby.map(({ locality, km }) => (
          <div key={locality.slug} className="relative">
            <ResultRow locality={locality} />
            <span className="pointer-events-none absolute right-3.5 top-3.5 rounded-full bg-page-plane px-2 py-0.5 text-[10.5px] font-semibold text-ink-secondary">
              {formatKm(km)}
            </span>
          </div>
        ))}
      </div>
      <RequestLocality
        variant="link"
        context={{
          query: place.query,
          city,
          placeLabel: place.label,
          lat: place.lat,
          lon: place.lon,
          nearestSlug: place.nearby[0]?.locality.slug,
          nearestKm: place.nearby[0]?.km,
        }}
      />
    </section>
  );
}

function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}
