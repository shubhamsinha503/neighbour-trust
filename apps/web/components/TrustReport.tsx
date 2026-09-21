/**
 * The locality report — verdict, Trust Score, category grid, disagreements.
 *
 * Section order is taken directly from the consumer-psychology reasoning in
 * docs/strategy.md, and is the part most worth not rearranging:
 *
 *   1. Verdict + score meter — interpretation before the number.
 *   2. Flags — loss aversion: a flagged risk is weighed about twice
 *      as heavily as an equivalent gain, so it gets its own callout instead of
 *      being one tile among several.
 *   3. (Removed: the honesty banner. Coverage is stated on the score itself.)
 *   4. Category grid — including the categories we have nothing for, because a
 *      grid that silently shows only what it has is a different claim than one
 *      that lists every category and admits which are empty.
 *   5. (Removed from the page: disagreements. Still computed and returned by
 *      the API, and still available to the Q&A agent as evidence.)
 *   6. Source strip — the credibility engine, in the main flow per
 *      Prominence-Interpretation Theory.
 */

import Link from "next/link";
import type { Confidence } from "@schema/envelope";
import { ExpandableCard } from "@/components/ExpandableCard";
import { UpcomingCard } from "@/components/UpcomingCard";
import { joinCategoryLabels } from "@/lib/categories";
import { CONFIDENCE_COLOR, CONFIDENCE_LABEL } from "@/lib/aqi";
import type {
  ConnectivityFeature,
  ConnectivityView,
  Flag,
  LocalityReport,
  ReportCategory,
} from "@/lib/api";

const SCORE_COLORS: Array<[number, string]> = [
  [75, "var(--color-status-good)"],
  [55, "var(--color-status-warning)"],
  [40, "var(--color-status-serious)"],
  [0, "var(--color-status-critical)"],
];

function colorForScore(score: number): string {
  return SCORE_COLORS.find(([floor]) => score >= floor)?.[1] ?? SCORE_COLORS[0][1];
}

export function TrustReport({
  report,
  connectivity,
}: {
  report: LocalityReport;
  /** Optional. The map is drawn from it when present and skipped when not, so
   *  a locality whose connectivity has not been fetched still renders a whole
   *  report rather than a broken one. */
  connectivity?: ConnectivityView | null;
}) {
  const { trustScore: trust, locality } = report;

  return (
    <div>
      {/* 1 — verdict and score */}
      <section className="rounded-[20px] border border-hairline bg-surface-1 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <div className="flex items-start gap-4">
          <ScoreMeter trust={trust} />
          <div>
            {/* What the number is a score *of*.
             *
             * The score rarely rests on all five categories, and the ones that
             * are present are the ones present everywhere — dense Indian cities
             * have schools on every street, and air readings cluster tightly
             * within a city. A bare "94" therefore looks like a verdict on the
             * neighbourhood while being a statement about two or three things.
             *
             * Naming the basis beside the number costs nothing and is the
             * difference between a claim and an overclaim. */}
            <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.05em] text-brand">
              {trust.score === null
                ? "Our take"
                : `Based on ${countedLabels(report) || "partial data"}`}
            </div>
            <h2 className="text-[14.5px] font-semibold leading-[1.4] text-ink-primary">
              {report.verdict}
            </h2>
          </div>
        </div>

        {/* 2 — flags: what was actually found here.
          *
          * Replaces the single "biggest watch-out", which could only fire for a
          * *scored* category — so safety and water, the two things a buyer most
          * wants flagged, were structurally incapable of being flagged and
          * showed a grey dash instead. See agents/orchestrator/flags.py.
          *
          * These are not scores. A flag fires on the presence of something,
          * never its absence, so a locality nobody reports on is not awarded a
          * clean bill of health for being ignored. */}
        {report.flags.length > 0 && (
          <div className="mt-4 space-y-2">
            {report.flags.slice(0, 3).map((flag) => (
              <FlagCard key={`${flag.category}-${flag.headline}`} flag={flag} />
            ))}
          </div>
        )}

        {/* 3 — what's nearby, answered as distances rather than a map.
          *
          * This replaced a scatter of ~200 amenity icons across distance rings.
          * That map looked like information and was noise: a buyer cannot read
          * "is this well connected" out of a dot cloud. The question they have is
          * "how close is what I need", so the answer is that — the nearest of
          * each kind, with a walk time, and industrial land flagged as the
          * downside it is rather than mixed in with the amenities.
          *
          * Absent connectivity simply means this section does not render, never a
          * gap where it should be. */}
        {connectivity && <NearbyList connectivity={connectivity} />}

        {/* 6 — source strip, kept with the score where it does its work */}
        {report.sourcesUsed.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-gridline pt-3">
            <span className="w-full text-[9.5px] text-ink-muted">Data pulled from</span>
            {report.sourcesUsed.map((source) => (
              <span
                key={source}
                className="rounded-md bg-page-plane px-1.5 py-1 text-[10px] font-bold text-ink-secondary"
              >
                {source}
              </span>
            ))}
          </div>
        )}
      </section>

      {/* 4 — the category grid, empties included */}
      <h3 className="mb-2.5 mt-6 flex items-center justify-between text-[11.5px] font-bold uppercase tracking-[0.05em] text-ink-secondary">
        Categories
        <span className="text-[11px] font-medium normal-case tracking-normal text-ink-muted">
          {trust.categoriesCounted} scored · {trust.categoriesTotal - trust.categoriesCounted} not yet
        </span>
      </h3>
      {/* Categories we have something for get a card. Categories we have nothing
        * for get one line between them, rather than a full card each saying
        * "no source yet" — four of those turned the page into a wall and pushed
        * the parts that carry information below the fold. They stay listed,
        * because a grid that silently shows two is a different claim than one
        * that lists them all and admits which are empty. */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {report.categories
          .filter((category) => category.available)
          .map((category) => (
            <CategoryCard
              key={category.category}
              category={category}
              slug={locality.slug}
              localityName={locality.name}
            />
          ))}
      </div>
      {/* Categories we have no data for are simply not shown. We still never
        * estimate them — a blank card is just left out rather than announced,
        * because "No data yet for Safety, Water" read to a buyer as the product
        * being broken, not as candour. The score chip already states how many
        * categories fed it, which is where the honest count belongs. */}

      {/* One route in per page, whatever the categories hold. The per-card link
        * only appears on a card with nothing measured, and a category with
        * nothing at all has no card — so on most localities the only way a
        * resident could reach the form was a page that did not exist. */}
      <div className="mt-2.5 flex items-center justify-between gap-3 rounded-2xl border border-hairline bg-surface-1 px-3.5 py-3">
        <p className="text-[11.5px] leading-[1.5] text-ink-secondary">
          Live in {locality.name}? Water, power, safety — what you have seen is
          what no official source publishes.
        </p>
        <ReportLink localityName={locality.name} />
      </div>

      {/* 4b — what the press says is coming.
        *
        * Below the categories rather than among them, because it is not one:
        * it carries no score, no confidence tag and no weight. Reading it as a
        * sixth category would invite the comparison it must not support — that
        * a locality written about more has more planned. */}
      <UpcomingCard localityName={locality.name} items={report.upcoming} />
    </div>
  );
}



/** The categories actually behind the number, lowercased for inline use.
 *
 * The joining lives in lib/categories so the search card says the same thing
 * this does. It did not, once: the card hardcoded "air+schools" while this
 * derived the real list, and the two pages contradicted each other in public.
 */
function countedLabels(report: LocalityReport): string {
  return joinCategoryLabels(
    report.categories.filter((c) => c.counted).map((c) => c.label),
  );
}


/** One thing found in this locality, raised out of the category grid. */
function FlagCard({ flag }: { flag: Flag }) {
  const serious = flag.severity === "serious";

  return (
    <div
      className={
        serious
          ? "flex items-start gap-2.5 rounded-2xl border border-[rgba(214,69,45,0.30)] bg-[rgba(214,69,45,0.07)] px-3.5 py-3"
          : "flex items-start gap-2.5 rounded-2xl border border-[rgba(250,178,25,0.35)] bg-[rgba(250,178,25,0.10)] px-3.5 py-3"
      }
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={serious ? "#c0442c" : "#c9860a"}
        strokeWidth="2.3"
        className="mt-[3px] shrink-0"
        aria-hidden="true"
      >
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
        <path d="M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      </svg>
      <div>
        {/* Just the finding. The paragraph of caveat that used to sit here — that
          * press coverage is not a crime rate, that flooding is a property of a
          * place, that no official water source exists — is true and important,
          * but it is the same on every locality and belongs in the policy page,
          * not repeated under every flag. */}
        <b className="text-[12.5px] leading-[1.4]">{flag.headline}</b>
      </div>
    </div>
  );
}


/**
 * What's nearby, as the nearest of each kind with a walk time — the honest
 * answer to the question a buyer actually has, in place of the amenity-icon map.
 *
 * Counts come from the stored locality-wide totals; the nearest distance is
 * measured from the centroid over the mapped features, so a locality whose
 * envelope predates per-feature coordinates still shows counts, just without a
 * distance. Industrial land is not an amenity, so it is a footnote, not a row.
 */
const NEARBY_KINDS: Array<{
  countKey: keyof ConnectivityView["counts"];
  kind: ConnectivityFeature["kind"];
  label: string;
}> = [
  { countKey: "hospitals", kind: "hospitals", label: "Hospitals" },
  { countKey: "parks", kind: "parks", label: "Parks" },
  { countKey: "markets", kind: "markets", label: "Supermarkets" },
  { countKey: "clinics", kind: "clinics", label: "Clinics" },
  { countKey: "metroRail", kind: "metro_rail", label: "Transit stations" },
];

/** Great-circle distance in km. Defined here rather than imported from
 *  MeasureFrom because that is a "use client" module and this component renders
 *  on the server — importing the helper across that boundary and calling it
 *  during server render throws. */
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function nearestKm(
  features: ConnectivityFeature[],
  kind: ConnectivityFeature["kind"],
  from: { lat: number; lon: number },
): number | null {
  let best = Infinity;
  for (const f of features) {
    if (f.kind !== kind) continue;
    const km = haversineKm(from.lat, from.lon, f.lat, f.lon);
    if (km < best) best = km;
  }
  return best === Infinity ? null : best;
}

function distanceText(km: number): string {
  const m = km * 1000;
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${km.toFixed(1)} km`;
}

/** ~80 m/min is an unhurried walk; past a quarter-hour it is really a drive. */
function walkText(km: number): string {
  const mins = Math.max(1, Math.round((km * 1000) / 80));
  return mins <= 15 ? `~${mins} min walk` : "a short drive";
}

function NearbyList({ connectivity }: { connectivity: ConnectivityView }) {
  const { locality, counts, features } = connectivity;
  const from = { lat: locality.lat, lon: locality.lon };

  const rows = NEARBY_KINDS.map(({ countKey, kind, label }) => ({
    label,
    count: counts[countKey],
    km: nearestKm(features, kind, from),
  })).filter((row) => row.count > 0);

  if (rows.length === 0) return null;

  const industrial = counts.industrialSites;

  return (
    <div className="mt-4">
      <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-brand">
        What&apos;s nearby
      </div>
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex items-baseline justify-between gap-3 border-b border-gridline py-2 last:border-0"
          >
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-ink-primary">
                {row.label}
              </div>
              <div className="text-[10.5px] text-ink-muted">{row.count} nearby</div>
            </div>
            <div className="shrink-0 text-right">
              {row.km !== null ? (
                <>
                  <div className="text-[13px] font-bold text-ink-primary">
                    {distanceText(row.km)}
                  </div>
                  <div className="text-[10px] text-ink-muted">
                    nearest · {walkText(row.km)}
                  </div>
                </>
              ) : (
                <div className="text-[11px] text-ink-muted">count only</div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {industrial > 0 && (
        <p className="mt-2 text-[10.5px] leading-[1.5] text-ink-muted">
          Also nearby: {industrial} industrial{" "}
          {industrial === 1 ? "site" : "sites"} — worth noting for a home.
        </p>
      )}
    </div>
  );
}

function ScoreMeter({ trust }: { trust: LocalityReport["trustScore"] }) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const score = trust.score;
  const color = score === null ? "var(--color-ink-muted)" : colorForScore(score);
  const offset = circumference * (1 - (score ?? 0) / 100);

  return (
    <div className="relative h-[76px] w-[76px] shrink-0">
      <svg width="76" height="76" viewBox="0 0 76 76" className="-rotate-90">
        <circle
          cx="38"
          cy="38"
          r={radius}
          fill="none"
          stroke={color}
          strokeOpacity={0.18}
          strokeWidth="8"
        />
        {score !== null && (
          <circle
            cx="38"
            cy="38"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference.toFixed(2)}
            strokeDashoffset={offset.toFixed(2)}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {/* An em dash rather than a zero: no score is not a score of nothing. */}
        <div className="text-[22px] font-bold leading-none text-ink-primary">
          {score ?? "—"}
        </div>
        <div className="text-[9px] text-ink-muted">/ 100</div>
      </div>
    </div>
  );
}

function CategoryCard({
  category,
  slug,
  localityName,
}: {
  category: ReportCategory;
  slug: string;
  localityName: string;
}) {
  // Connectivity earned a detail page when its distances became re-measurable
  // from an address — the tile can only show one line, and "nearest station
  // 0.21 km" is measured from the locality centre until someone says otherwise.
  const hasDetailPage =
    category.category === "air_quality" ||
    category.category === "schools" ||
    category.category === "infrastructure";
  const color =
    category.score !== null ? colorForScore(category.score) : "var(--color-gridline)";

  const cardClass = `h-full rounded-2xl border p-3.5 ${
    category.counted
      ? "border-hairline bg-surface-1"
      : "border-dashed border-gridline bg-page-plane"
  }`;

  /*
    An unscored category shows no number and no meter at all.

    It used to render an em dash above an empty progress bar, which is the
    shape of a broken component rather than of an answer — the eye reads a
    zero-width bar as a score of nothing, which is the one reading this
    product must never invite.

    The alternative considered and rejected was giving unscored categories a
    default number. Silence in the local press is not evidence of safety,
    and scoring it as though it were would rank the neighbourhoods nobody
    writes about above the ones that get covered.
  */
  const header = (
    <>
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="text-[12.5px] font-semibold text-ink-primary">
          {category.label}
        </div>
        {category.score !== null && (
          <div className="flex shrink-0 items-center gap-1.5">
            {/* A baseline is not a measurement, so it must not look like one. */}
            {category.isBaseline && (
              <span className="rounded bg-page-plane px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.04em] text-ink-muted">
                Baseline
              </span>
            )}
            <div
              className="text-[17px] font-bold leading-none"
              style={{ color: category.isBaseline ? "var(--color-ink-muted)" : color }}
            >
              {category.score}
            </div>
          </div>
        )}
      </div>

      {category.score !== null && (
        <div className="mb-1 h-[5px] w-full overflow-hidden rounded-[3px] bg-gridline">
          <div
            className={`h-full rounded-[3px] ${category.isBaseline ? "opacity-40" : ""}`}
            style={{
              width: `${category.score}%`,
              background: category.isBaseline ? "var(--color-ink-muted)" : color,
            }}
          />
        </div>
      )}
    </>
  );

  // Folded by default and opened by tapping the card: the grid is read at a
  // glance, and a paragraph under every score made the page a wall of text.
  const detail = (
    <>
      <div className="mt-2 text-[11px] leading-[1.45] text-ink-secondary">
        {category.summary || category.status}
      </div>
      {/* The invitation belongs on exactly the cards where we admit we know
        * little: nothing measurable, or a baseline standing in for silence. */}
      {(category.score === null || category.isBaseline) && (
        <ReportLink category={category.label} localityName={localityName} />
      )}
    </>
  );

  const footer = (
    <span className="flex items-center gap-3">
      {category.confidence ? (
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-ink-secondary">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: CONFIDENCE_COLOR[category.confidence as Confidence] }}
            aria-hidden="true"
          />
          {CONFIDENCE_LABEL[category.confidence as Confidence]}
        </span>
      ) : (
        <span className="text-[10px] text-ink-muted">No data yet</span>
      )}
      {hasDetailPage && category.available && (
        <Link
          href={`/${slug}/${DETAIL_PATH[category.category]}`}
          className="text-[10px] text-brand hover:underline"
        >
          Details →
        </Link>
      )}
    </span>
  );

  return (
    <ExpandableCard className={cardClass} header={header} detail={detail} footer={footer} />
  );
}

/**
 * Category name to URL segment.
 *
 * Explicit rather than derived from the category name. The internal name is
 * "infrastructure" and the page a reader sees is "connectivity" — the category
 * is scoped in docs/strategy.md to RERA and upcoming projects, while what we
 * actually ship is what is already built. Deriving the path would have produced
 * a link to a route that does not exist, silently, on the one category where
 * the two names disagree.
 */
const DETAIL_PATH: Record<string, string> = {
  air_quality: "air-quality",
  schools: "schools",
  infrastructure: "connectivity",
};

/**
 * "Seen something here?" — the only route a resident has into these categories.
 *
 * Safety, water and power have no official Indian source at locality level, so
 * local press is the entire record and press coverage is thin wherever
 * journalists are. docs/strategy.md calls power a crowd-sourced category "for
 * the foreseeable future"; this is the first step of that, and it deliberately
 * appears on exactly the cards where we admit we know nothing.
 *
 * Renders only when NEXT_PUBLIC_REPORT_URL is set. A button that goes nowhere
 * is worse than no button — it reads as a broken promise on the one card whose
 * whole job is to admit a gap — and the destination is a deployment choice
 * rather than something to hardcode, so no contact address ships in the source.
 */
/**
 * Prefill wiring for the intake form at NEXT_PUBLIC_REPORT_URL.
 *
 * These field ids belong to that specific form and are meaningless without it —
 * if the form is ever rebuilt, both must be re-read from the live form's HTML
 * and changed here together. A stale id prefills nothing rather than filling
 * the wrong field, so the failure is quiet and harmless, which is also why it
 * is worth writing down that it can happen.
 */
const FORM_FIELD_LOCALITY = "entry.1723945049";
const FORM_FIELD_CATEGORY = "entry.319282764";

/**
 * Our card labels are not the form's answer options, and Google Forms only
 * prefills a choice when the value matches its option text exactly. Mapping
 * them here keeps the two vocabularies deliberately separate: the card says
 * "Connectivity" because that is what we measured, while the form asks about
 * "Roads, transport or nearby construction" because that is what a resident
 * would actually have witnessed.
 */
const FORM_CATEGORY_OPTION: Record<string, string> = {
  Safety: "Safety or crime",
  Water: "Water (supply, flooding, quality)",
  Power: "Power cuts",
  Schools: "Schools",
  "Air quality": "Air quality or pollution",
  Connectivity: "Roads, transport or nearby construction",
};

function ReportLink({
  category,
  localityName,
}: {
  /** Omitted for the page-level link, which leaves the choice to the resident. */
  category?: string;
  localityName: string;
}) {
  const base = process.env.NEXT_PUBLIC_REPORT_URL;
  if (!base) return null;

  const params = new URLSearchParams({
    // Google's own marker for a prefilled link.
    usp: "pp_url",
    [FORM_FIELD_LOCALITY]: localityName,
  });
  // Only send a category the form actually offers. An unmapped label would
  // arrive as a value no option matches, which Google silently drops — the
  // reporter would then see the question unanswered with no idea why.
  const option = category ? FORM_CATEGORY_OPTION[category] : undefined;
  if (option) params.set(FORM_FIELD_CATEGORY, option);

  const url = `${base}${base.includes("?") ? "&" : "?"}${params.toString()}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex shrink-0 items-center gap-1 text-[10.5px] font-semibold text-brand underline decoration-dotted underline-offset-2 hover:decoration-solid ${category ? "mt-2" : ""}`}
    >
      Seen something? Tell us
      <span aria-hidden="true">→</span>
    </a>
  );
}
