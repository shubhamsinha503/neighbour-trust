"use client";

/**
 * The schools card.
 *
 * Same structural order as the air quality card — verdict, tiles, detail,
 * honesty note, sources — because that ordering encodes the psychology reasoning
 * in docs/strategy.md and shouldn't vary per category.
 *
 * What differs is how much work the honesty section does. This card answers one
 * question only — how many schools are nearby and how close — because that is all
 * open data supports at locality level. No open Indian source describes school
 * quality, so the card never shows a quality signal and says so, keeping "nearby"
 * from being read as "good".
 */

import { useT } from "@/components/LanguageProvider";
import { useState } from "react";
import type { Confidence } from "@schema/envelope";
import { CONFIDENCE_COLOR, CONFIDENCE_LABEL } from "@/lib/aqi";
import type { SchoolsView } from "@/lib/api";
import { MeasureFrom, haversineKm, type Origin } from "@/components/MeasureFrom";

export function SchoolsCard({ view }: { view: SchoolsView }) {
  const t = useT();
  const { payload, verdict, locality } = view;
  const [origin, setOrigin] = useState<Origin | null>(null);

  // Re-measured from the reader's address when they give one, and re-sorted:
  // a list ordered by distance from somewhere else is not a list of the
  // closest schools, it just looks like one.
  //
  // Schools whose coordinates predate this feature keep their stored
  // distance and sort last, rather than being dropped or shown a number
  // measured from a point nobody asked about.
  const schools = origin
    ? payload.nearestSchools
        .map((school) => ({
          ...school,
          distanceKm:
            school.lat !== undefined && school.lon !== undefined
              ? haversineKm(origin.lat, origin.lon, school.lat, school.lon)
              : undefined,
        }))
        .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
    : payload.nearestSchools;

  return (
    <article className="rounded-[20px] border border-hairline bg-surface-1 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      {/* 1 — verdict */}
      <header className="mb-4 flex items-start gap-4">
        <Meter score={verdict.score} />
        <div>
          <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.05em] text-brand">
            {verdict.eyebrow}
          </div>
          <h2 className="text-[14.5px] font-semibold leading-[1.4] text-ink-primary">
            {verdict.headline}
          </h2>
        </div>
      </header>

      {/* 2 — stat tiles. The card is about access, so the tiles count what is
          nearby and how close. It never shows a staffing or quality figure — no
          open source supports one — and never estimates. */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile
          label={t("schools.within2")}
          value={payload.schoolsWithin2km.toString()}
          sub={t("schools.schoolsWord")}
        />
        <StatTile
          label={t("schools.within5")}
          value={payload.schoolsWithin5km.toString()}
          sub={t("schools.schoolsWord")}
        />
      </div>

      {payload.boardsAvailable.length > 0 && (
        <p className="mt-3 text-[11.5px] text-ink-secondary">
          Boards represented nearby:{" "}
          <strong className="font-semibold">
            {payload.boardsAvailable.slice(0, 6).join(", ")}
          </strong>
        </p>
      )}

      {payload.governmentSharePct !== undefined && (
        <p className="mt-1.5 text-[11px] text-ink-muted">
          {payload.governmentSharePct.toFixed(0)}% of nearby schools are
          government-run.
        </p>
      )}

      {/* 3 — the nearest few, with honest blanks */}
      {payload.nearestSchools.length > 0 && (
        <section className="mt-5 border-t border-gridline pt-4">
          <h3 className="mb-2.5 text-[11.5px] font-bold uppercase tracking-[0.05em] text-ink-secondary">
            Closest schools
          </h3>
          <div className="mb-3">
            <MeasureFrom
              localityName={locality.name}
              city={locality.city}
              centroid={{ lat: locality.lat, lon: locality.lon }}
              origin={origin}
              onChange={setOrigin}
            />
          </div>
          <ul className="flex flex-col gap-2">
            {schools.map((school, index) => (
              <li
                // Index is part of the key because OSM has no stable id in the
                // payload and genuinely does contain same-name schools at the
                // same distance (a chain with two branches on one road).
                key={`${school.udiseCode ?? school.name}-${index}`}
                className="flex items-baseline justify-between gap-3 border-b border-gridline pb-2 last:border-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] font-medium text-ink-primary">
                    {school.name}
                  </div>
                  <div className="text-[10.5px] text-ink-muted">
                    {[
                      school.distanceKm !== undefined
                        ? `${school.distanceKm.toFixed(1)} km`
                        : null,
                      school.management,
                      school.board,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 5 — sources and confidence */}
      <footer className="mt-4 border-t border-dashed border-gridline pt-3">
        <div className="mb-2 text-[9.5px] text-ink-muted">{t("report.dataPulledFrom")}</div>
        <div className="flex flex-wrap items-center gap-2">
          {payload.sourcesUsed.map((source) => (
            <span
              key={source}
              className="rounded-md bg-page-plane px-1.5 py-1 text-[10px] font-bold text-ink-secondary"
            >
              {source}
            </span>
          ))}
          <ConfidenceChip confidence={view.confidence} />
        </div>
      </footer>
    </article>
  );
}

function Meter({ score }: { score: number }) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  // Schools has no equivalent of the CPCB band scale, so the meter uses the
  // brand colour rather than a status colour. Status colours are reserved for
  // genuine status; a capacity score is not one.
  const color = "var(--color-brand)";

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
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-[22px] font-bold leading-none text-ink-primary">
          {score}
        </div>
        <div className="text-[9px] text-ink-muted">/ 100</div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  muted,
}: {
  label: string;
  value: string;
  sub: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-3 py-2.5 ${
        muted
          ? "border-[rgba(250,178,25,0.35)] bg-[rgba(250,178,25,0.10)]"
          : "border-hairline bg-page-plane"
      }`}
    >
      <div className="text-[10px] font-medium uppercase tracking-[0.04em] text-ink-muted">
        {label}
      </div>
      <div className="mt-1 text-[19px] font-bold leading-none text-ink-primary">
        {value}
      </div>
      <div className="mt-1 text-[10.5px] text-ink-secondary">{sub}</div>
    </div>
  );
}

function ConfidenceChip({ confidence }: { confidence: Confidence }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-ink-secondary">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: CONFIDENCE_COLOR[confidence] }}
        aria-hidden="true"
      />
      {CONFIDENCE_LABEL[confidence]}
    </span>
  );
}
