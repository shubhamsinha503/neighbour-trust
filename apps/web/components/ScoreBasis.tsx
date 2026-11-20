/**
 * What the Trust Score covers, said next to the number.
 *
 * The score averages only what we could measure. That keeps a missing category
 * from dragging a locality down, but it means a number built on two categories
 * looks exactly as complete as one built on five. So the coverage is shown as a
 * bar, the gaps are named in a sentence, and the full arithmetic — every
 * category, its weight, its share of this number, and why the others are
 * missing — is one tap away.
 */

import Link from "next/link";
import type { LocalityReport } from "@/lib/api";
import { categoryLabel } from "@/lib/i18n";
import { getServerT } from "@/lib/i18n-server";
import { ConfidenceTag } from "@/components/Provenance";
import { breakdown, CATEGORY_MEASURES, joinLabels } from "@/lib/scoring";

export async function ScoreBasis({ report }: { report: LocalityReport }) {
  const { t } = await getServerT();
  const trust = report.trustScore;
  const b = breakdown(report, (c) => categoryLabel(t, c.category, c.label));
  const hasScore = trust.score !== null;
  const missing = b.notCounted.map((p) => p.label);

  return (
    <div className="mt-4 rounded-2xl bg-page-plane px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11.5px] font-semibold text-ink-primary">
          {hasScore
            ? `Based on ${b.counted.length} of ${trust.categoriesTotal} categories`
            : "Not enough data for an overall score"}
        </span>
        <span className="text-[10.5px] font-semibold text-ink-secondary">
          {b.coveragePct}% of the full picture
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gridline"
        role="img"
        aria-label={`The score rests on ${b.coveragePct}% of the weight a full report would use`}
      >
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${Math.min(100, Math.max(0, b.coveragePct))}%` }}
        />
      </div>

      <p className="mt-2 text-[11px] leading-[1.55] text-ink-secondary">
        {hasScore && b.partial && missing.length > 0 && (
          <>
            <b className="font-semibold text-ink-primary">Partial picture.</b>{" "}
            {joinLabels(missing)} {missing.length === 1 ? "is" : "are"} not in this
            number. Treat {missing.length === 1 ? "it" : "them"} as unknown, not as fine —
            the score averages only what we could measure.{" "}
          </>
        )}
        {hasScore && !b.partial && (
          <>Every category we assess is measured here. </>
        )}
        {!hasScore && (
          <>
            We only publish a score when at least {trust.minCoveragePct}% of the
            weight is measured. Everything we do know is shown below.{" "}
          </>
        )}
        {hasScore && b.weakInputs.length > 0 && (
          <>
            {joinLabels(b.weakInputs)} {b.weakInputs.length === 1 ? "rests" : "rest"} on
            low-confidence or community-estimated data.{" "}
          </>
        )}
        {trust.powerPenalty > 0 && (
          <>
            {trust.powerPenalty} points were taken off for reported power problems
            {trust.powerPenaltyReason ? ` (${trust.powerPenaltyReason})` : ""}.{" "}
          </>
        )}
      </p>

      <details className="group mt-2">
        <summary className="cursor-pointer list-none text-[11px] font-semibold text-brand [&::-webkit-details-marker]:hidden">
          <span aria-hidden="true" className="group-open:hidden">▸</span>
          <span aria-hidden="true" className="hidden group-open:inline">▾</span>{" "}
          How this score is built
        </summary>

        <div className="mt-2 space-y-3 text-[11px] leading-[1.55] text-ink-secondary">
          {b.counted.length > 0 && (
            <div>
              <div className="mb-1 font-semibold text-ink-primary">In the number</div>
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.04em] text-ink-muted">
                    <th className="py-1 pr-2 font-semibold">Category</th>
                    <th className="py-1 pr-2 text-right font-semibold">Score</th>
                    <th className="py-1 pr-2 text-right font-semibold">Share</th>
                    <th className="py-1 font-semibold">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {b.counted.map((p) => (
                    <tr key={p.category} className="border-t border-gridline align-top">
                      <td className="py-1.5 pr-2">
                        <div className="font-semibold text-ink-primary">{p.label}</div>
                        <div className="text-[10px] text-ink-muted">
                          {CATEGORY_MEASURES[p.category] ?? ""}
                        </div>
                      </td>
                      <td className="py-1.5 pr-2 text-right font-semibold text-ink-primary">
                        {p.score}
                      </td>
                      <td className="py-1.5 pr-2 text-right" title={`Base weight ${p.basePct}%`}>
                        {p.sharePct}%
                      </td>
                      <td className="py-1.5 text-[10px]">
                        {p.confidence ? <ConfidenceTag confidence={p.confidence} /> : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-[10px] text-ink-muted">
                Share is each category&apos;s weight divided by the weight of the
                categories counted here, so the shares add to 100%.
              </p>
            </div>
          )}

          {b.notCounted.length > 0 && (
            <div>
              <div className="mb-1 font-semibold text-ink-primary">Not in the number</div>
              <ul className="space-y-1">
                {b.notCounted.map((p) => (
                  <li key={p.category}>
                    <b className="font-semibold text-ink-primary">{p.label}:</b> {p.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ul className="list-disc space-y-1 pl-4">
            <li>
              Full-model weights: air quality, schools and safety 24% each, water
              17%, connectivity 11%. They are a judgement about what matters to a
              buyer, not a measurement.
            </li>
            <li>
              Missing categories are left out and the rest re-weighted. They are
              never scored as zero or as average.
            </li>
            <li>
              Below {trust.minCoveragePct}% of the weight, no score is published.
            </li>
            <li>
              Never in the score: modelled flood risk, sunlight, &ldquo;reported as
              coming&rdquo; projects and resident reports. They are shown separately.
            </li>
          </ul>

          <Link
            href="/about#trust-score"
            className="inline-block font-semibold text-brand underline decoration-dotted underline-offset-2"
          >
            Full methodology →
          </Link>
        </div>
      </details>
    </div>
  );
}
