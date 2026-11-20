/**
 * "Where each figure comes from" — one row per indicator on the report.
 *
 * The category strip shows numbers; this is where each one can be checked: the
 * source (linked), the date the data describes, the confidence tag, and for
 * press-derived categories the original articles themselves. Flood is listed
 * too, because a modelled hazard is exactly the kind of figure a buyer should be
 * able to trace before acting on it.
 */

import type { FloodInfo, ReportCategory } from "@/lib/api";
import { categoryLabel } from "@/lib/i18n";
import { getServerT } from "@/lib/i18n-server";
import { Provenance } from "@/components/Provenance";

const PRESS = new Set(["crime", "water", "power"]);

export async function SourcesList({
  categories,
  flood,
}: {
  categories: ReportCategory[];
  flood: FloodInfo;
}) {
  const { t } = await getServerT();
  const rows = categories.filter((c) => c.available);
  if (rows.length === 0 && !flood.source) return null;

  return (
    <section
      id="sources"
      className="mt-4 rounded-[20px] border border-hairline bg-surface-1 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
    >
      <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.05em] text-brand">
        Where each figure comes from
      </div>
      <p className="text-[11px] leading-[1.5] text-ink-muted">
        Open any source to check it yourself. Dates are when the data was
        measured or published, not when this page was built.
      </p>

      <ul className="mt-3 flex flex-col">
        {rows.map((c) => {
          const press = PRESS.has(c.category);
          return (
            <li key={c.category} className="border-b border-gridline py-2.5 last:border-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[12.5px] font-semibold text-ink-primary">
                  {categoryLabel(t, c.category, c.label)}
                </span>
                <span className="shrink-0 text-[11px] font-semibold text-ink-secondary">
                  {c.score === null
                    ? "Not scored"
                    : c.isBaseline
                      ? `${c.score} · baseline, not counted`
                      : c.counted
                        ? `${c.score} / 100`
                        : `${c.score} · not counted`}
                </span>
              </div>
              {c.summary && (
                <p className="mt-0.5 text-[11px] leading-[1.5] text-ink-secondary">{c.summary}</p>
              )}
              <Provenance
                sourceName={c.sourceName}
                sourceUrl={c.sourceUrl}
                asOf={c.dataVintage}
                asOfLabel={press ? "Latest report" : "Data from"}
                fetchedAt={c.fetchedAt}
                confidence={c.confidence}
                evidence={c.evidence}
                evidenceLabel={c.evidence.length === 1 ? "original article" : "most recent original articles"}
              />
            </li>
          );
        })}

        {flood.source && (
          <li className="border-b border-gridline py-2.5 last:border-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[12.5px] font-semibold text-ink-primary">Flood risk</span>
              <span className="shrink-0 text-[11px] font-semibold text-ink-secondary">
                {flood.inZone ? "In a modelled flood zone" : "No modelled zone nearby"} · never scored
              </span>
            </div>
            <p className="mt-0.5 text-[11px] leading-[1.5] text-ink-secondary">
              1-in-{flood.returnPeriodYears}-year river flood, modelled at about 1 km.
              Regional screening — not street-level and not observed flooding.
            </p>
            <Provenance
              sourceName={flood.source}
              sourceUrl={flood.sourceUrl}
              confidence="low"
            />
            {flood.vintage && (
              <div className="text-[10.5px] text-ink-muted">Model vintage: {flood.vintage}</div>
            )}
          </li>
        )}
      </ul>
    </section>
  );
}
