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
 *   3. Honesty banner — the pratfall effect works only *after* competence is
 *      established, so this sits below the score, never above it.
 *   4. Category grid — including the categories we have nothing for, because a
 *      grid that silently shows only what it has is a different claim than one
 *      that lists every category and admits which are empty.
 *   5. Disagreements — where sources conflict, stated rather than averaged away.
 *   6. Source strip — the credibility engine, in the main flow per
 *      Prominence-Interpretation Theory.
 */

import Link from "next/link";
import type { Confidence } from "@schema/envelope";
import { CONFIDENCE_COLOR, CONFIDENCE_LABEL } from "@/lib/aqi";
import type { Disagreement, Flag, LocalityReport, ReportCategory } from "@/lib/api";

const SCORE_COLORS: Array<[number, string]> = [
  [75, "var(--color-status-good)"],
  [55, "var(--color-status-warning)"],
  [40, "var(--color-status-serious)"],
  [0, "var(--color-status-critical)"],
];

function colorForScore(score: number): string {
  return SCORE_COLORS.find(([floor]) => score >= floor)?.[1] ?? SCORE_COLORS[0][1];
}

export function TrustReport({ report }: { report: LocalityReport }) {
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
             * difference between a claim and an overclaim. The honesty banner
             * below gives the weighting; this gives the subject. */}
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

      {/* 3 — the honesty banner, below the score by design */}
      <div className="mt-3 flex items-start gap-2.5 rounded-2xl bg-brand-soft px-3.5 py-3">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-brand)"
          strokeWidth="2.2"
          className="mt-0.5 shrink-0"
          aria-hidden="true"
        >
          <path d="M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1 3-6z" />
        </svg>
        <div>
          <b className="text-[12.5px] text-brand-deep">
            We show what we don&apos;t know, too.
          </b>
          <p className="mt-1 text-[11.5px] leading-[1.5] text-ink-secondary">
            This score covers{" "}
            <strong className="font-semibold">
              {trust.categoriesCounted} of {trust.categoriesTotal} categories
            </strong>{" "}
            ({trust.coveragePct}% of the weighting). Every category below carries its
            own confidence tag, and the ones we have no source for say so rather than
            being quietly scored as average.
          </p>
        </div>
      </div>

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
      <EmptyCategories
        categories={report.categories.filter((c) => !c.available)}
      />

      {/* 5 — disagreements */}
      {report.disagreements.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-2.5 text-[11.5px] font-bold uppercase tracking-[0.05em] text-ink-secondary">
            Where our sources disagree
          </h3>
          <div className="flex flex-col gap-2.5">
            {report.disagreements.map((d, i) => (
              <DisagreementCard key={`${d.category}-${i}`} disagreement={d} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * The categories with no data, as one line rather than a card each.
 *
 * Still shown. Leaving them out entirely would let the page imply we looked at
 * everything, and what we do not cover is part of what the reader is owed.
 */
function EmptyCategories({ categories }: { categories: ReportCategory[] }) {
  if (categories.length === 0) return null;

  return (
    <div className="mt-2.5 rounded-2xl border border-dashed border-hairline px-3.5 py-3">
      <p className="text-[11.5px] leading-[1.5] text-ink-secondary">
        <span className="font-semibold text-ink-primary">
          No data yet for {categories.map((c) => c.label).join(", ")}.
        </span>{" "}
        We leave these empty rather than estimating them.
      </p>
    </div>
  );
}


/** The categories actually behind the number, lowercased for inline use. */
function countedLabels(report: LocalityReport): string {
  const labels = report.categories
    .filter((c) => c.counted)
    .map((c) => c.label.toLowerCase());
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return labels.slice(0, -1).join(", ") + " and " + labels[labels.length - 1];
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
        <b className="text-[12.5px] leading-[1.4]">{flag.headline}</b>
        <p className="mt-1 text-[11.5px] leading-[1.5] text-ink-secondary">
          {flag.detail}
        </p>
      </div>
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

  const body = (
    <div
      className={`h-full rounded-2xl border p-3.5 ${
        category.counted
          ? "border-hairline bg-surface-1"
          : "border-dashed border-gridline bg-page-plane"
      }`}
    >
      {/*
        An unscored category shows no number and no meter at all.

        It used to render an em dash above an empty progress bar, which is the
        shape of a broken component rather than of an answer — the eye reads a
        zero-width bar as a score of nothing, which is the one reading this
        product must never invite. The dashed border already says "no data";
        drawing an empty meter says it a second time, worse.

        The alternative considered and rejected was giving unscored categories a
        default number. Silence in the local press is not evidence of safety,
        and scoring it as though it were would rank the neighbourhoods nobody
        writes about above the ones that get covered.
      */}
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="text-[12.5px] font-semibold text-ink-primary">
          {category.label}
        </div>
        {category.score !== null && (
          <div className="flex shrink-0 items-center gap-1.5">
            {/* A baseline is not a measurement, so it must not look like one.
              * It carries the muted ink rather than a status colour, and the
              * word "baseline" sits beside it — a green 80 next to a measured
              * green 80 would be the same pixel making two different claims. */}
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
        <div className="mb-2 h-[5px] w-full overflow-hidden rounded-[3px] bg-gridline">
          <div
            className={`h-full rounded-[3px] ${category.isBaseline ? "opacity-40" : ""}`}
            style={{
              width: `${category.score}%`,
              background: category.isBaseline ? "var(--color-ink-muted)" : color,
            }}
          />
        </div>
      )}

      <div className="min-h-[30px] text-[11px] leading-[1.4] text-ink-secondary">
        {category.summary || category.status}
      </div>

      {/* The invitation belongs on exactly the cards where we admit we know
        * little: nothing measurable, or a baseline standing in for silence. */}
      {(category.score === null || category.isBaseline) && (
        <ReportLink category={category.label} localityName={localityName} />
      )}

      <div className="mt-1.5 flex items-center justify-between gap-2">
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
          <span className="text-[10px] text-brand">Details →</span>
        )}
      </div>
    </div>
  );

  if (hasDetailPage && category.available) {
    return (
      <Link href={`/${slug}/${DETAIL_PATH[category.category]}`} className="block">
        {body}
      </Link>
    );
  }
  return body;
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

function DisagreementCard({ disagreement }: { disagreement: Disagreement }) {
  const notable = disagreement.severity === "notable";
  return (
    <div
      className={`rounded-2xl border px-3.5 py-3 ${
        notable
          ? "border-[rgba(74,58,167,0.28)] bg-[rgba(74,58,167,0.06)]"
          : "border-hairline bg-surface-1"
      }`}
    >
      <b className="text-[12px] text-ink-primary">{disagreement.headline}</b>
      <p className="mt-1 text-[11.5px] leading-[1.5] text-ink-secondary">
        {disagreement.detail}
      </p>
    </div>
  );
}

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
  category: string;
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
  const option = FORM_CATEGORY_OPTION[category];
  if (option) params.set(FORM_FIELD_CATEGORY, option);

  const url = `${base}${base.includes("?") ? "&" : "?"}${params.toString()}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-flex items-center gap-1 text-[10.5px] font-semibold text-brand underline decoration-dotted underline-offset-2 hover:decoration-solid"
    >
      Seen something? Tell us
      <span aria-hidden="true">→</span>
    </a>
  );
}
