/**
 * The locality report — verdict, Trust Score, category grid, disagreements.
 *
 * Section order is taken directly from the consumer-psychology reasoning in
 * docs/strategy.md, and is the part most worth not rearranging:
 *
 *   1. Verdict + score meter — interpretation before the number.
 *   2. Biggest watch-out — loss aversion: a flagged risk is weighed about twice
 *      as heavily as an equivalent gain, so it gets its own callout instead of
 *      being one tile among six.
 *   3. Honesty banner — the pratfall effect works only *after* competence is
 *      established, so this sits below the score, never above it.
 *   4. Category grid — including the categories we have nothing for, because a
 *      grid of six that silently shows four is a different claim than one that
 *      shows six and admits two are empty.
 *   5. Disagreements — where sources conflict, stated rather than averaged away.
 *   6. Source strip — the credibility engine, in the main flow per
 *      Prominence-Interpretation Theory.
 */

import Link from "next/link";
import type { Confidence } from "@schema/envelope";
import { CONFIDENCE_COLOR, CONFIDENCE_LABEL } from "@/lib/aqi";
import type { Disagreement, LocalityReport, ReportCategory } from "@/lib/api";

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
            <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.05em] text-brand">
              Our take
            </div>
            <h2 className="text-[14.5px] font-semibold leading-[1.4] text-ink-primary">
              {report.verdict}
            </h2>
          </div>
        </div>

        {/* 2 — biggest watch-out */}
        {report.biggestWatchout && (
          <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-[rgba(250,178,25,0.35)] bg-[rgba(250,178,25,0.10)] px-3 py-2.5">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#c9860a"
              strokeWidth="2.3"
              className="mt-0.5 shrink-0"
              aria-hidden="true"
            >
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
              <path d="M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            </svg>
            <div>
              <b className="text-[12px]">
                Biggest watch-out: {report.biggestWatchout.label}
              </b>
              <p className="mt-0.5 text-[11.5px] leading-[1.45] text-ink-secondary">
                {report.biggestWatchout.detail}
              </p>
            </div>
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
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {report.categories.map((category) => (
          <CategoryCard
            key={category.category}
            category={category}
            slug={locality.slug}
          />
        ))}
      </div>

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
}: {
  category: ReportCategory;
  slug: string;
}) {
  const hasDetailPage = category.category === "air_quality" || category.category === "schools";
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
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="text-[12.5px] font-semibold text-ink-primary">
          {category.label}
        </div>
        <div
          className="shrink-0 text-[17px] font-bold leading-none"
          style={{ color: category.score !== null ? color : "var(--color-ink-muted)" }}
        >
          {category.score ?? "—"}
        </div>
      </div>

      <div className="mb-2 h-[5px] w-full overflow-hidden rounded-[3px] bg-gridline">
        {category.score !== null && (
          <div
            className="h-full rounded-[3px]"
            style={{ width: `${category.score}%`, background: color }}
          />
        )}
      </div>

      <div className="min-h-[30px] text-[11px] leading-[1.4] text-ink-secondary">
        {category.summary || category.status}
      </div>

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
      <Link href={`/${slug}/${category.category.replace("_", "-")}`} className="block">
        {body}
      </Link>
    );
  }
  return body;
}

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
