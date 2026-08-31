/**
 * The schools card.
 *
 * Same structural order as the air quality card — verdict, tiles, detail,
 * honesty note, sources — because that ordering encodes the psychology reasoning
 * in docs/strategy.md and shouldn't vary per category.
 *
 * What differs is how much work the honesty section does. Air quality has one
 * good source and one clean number. Schools has a current source that can only
 * count buildings and a four-year-old source that has the staffing numbers for a
 * fraction of them. A buyer reading "61 schools within 2 km" will assume we know
 * something about all 61, so the gap between the count and the known is stated as
 * its own stat tile rather than left to a footnote.
 */

import type { Confidence } from "@schema/envelope";
import { CONFIDENCE_COLOR, CONFIDENCE_LABEL, relativeAge } from "@/lib/aqi";
import type { SchoolsView } from "@/lib/api";

export function SchoolsCard({ view }: { view: SchoolsView }) {
  const { payload, verdict } = view;

  const staffingGap =
    payload.schoolsWithin2km > 0 &&
    payload.schoolsWithStaffingData < payload.schoolsWithin2km;

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

      {/* 2 — stat tiles */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile
          label="Within 2 km"
          value={payload.schoolsWithin2km.toString()}
          sub="schools"
        />
        <StatTile
          label="Within 5 km"
          value={payload.schoolsWithin5km.toString()}
          sub="schools"
        />
        <StatTile
          label="Pupils per teacher"
          value={
            payload.medianPupilTeacherRatio !== undefined
              ? payload.medianPupilTeacherRatio.toFixed(0)
              : "—"
          }
          sub={
            payload.medianPupilTeacherRatio !== undefined
              ? "median, where known"
              : "not enough data"
          }
        />
        {/* The most important tile on this card: it is the one that stops the
            count above from being over-read. */}
        <StatTile
          label="Staffing known for"
          value={payload.schoolsWithStaffingData.toString()}
          sub={`of ${payload.schoolsWithin2km} nearby`}
          muted={staffingGap}
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
          <ul className="flex flex-col gap-2">
            {payload.nearestSchools.map((school, index) => (
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
                <div className="shrink-0 text-right">
                  {school.pupilTeacherRatio !== undefined ? (
                    <>
                      <div className="text-[13px] font-bold text-ink-primary">
                        {school.pupilTeacherRatio.toFixed(0)}:1
                      </div>
                      <div className="text-[9.5px] text-ink-muted">
                        pupils/teacher
                      </div>
                    </>
                  ) : (
                    /* Not a zero and not a dash-in-passing: the absence is the
                       finding, since this school exists in OSM but has no UDISE
                       record at all. */
                    <div className="text-[10px] text-ink-muted">
                      no staffing
                      <br />
                      data
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 4 — honesty, after the data */}
      <div className="mt-5 flex items-start gap-2.5 rounded-2xl bg-brand-soft px-3.5 py-3">
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
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8h.01M11 12h1v4h1" />
        </svg>
        <div>
          <b className="text-[12.5px] text-brand-deep">
            What this card can and can&apos;t tell you
          </b>
          <p className="mt-1 text-[11.5px] leading-[1.5] text-ink-secondary">
            {verdict.caveat}
          </p>
          <p className="mt-1.5 text-[11.5px] leading-[1.5] text-ink-secondary">
            {verdict.qualityDisclaimer}
          </p>
        </div>
      </div>

      {/* 5 — sources and confidence */}
      <footer className="mt-4 border-t border-dashed border-gridline pt-3">
        <div className="mb-2 text-[9.5px] text-ink-muted">Data pulled from</div>
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
        <p className="mt-2.5 text-[10px] leading-relaxed text-ink-muted">
          Underlying survey dated{" "}
          {new Date(view.dataVintage).toLocaleDateString("en-IN", {
            month: "short",
            year: "numeric",
          })}{" "}
          · fetched {relativeAge(view.fetchedAt)} · locality{" "}
          {view.locality.name}, H3 cell{" "}
          <code className="font-mono">{view.h3Cell}</code>
          {view.sourceUrl && (
            <>
              {" · "}
              <a
                href={view.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-dotted underline-offset-2 hover:text-ink-secondary"
              >
                source
              </a>
            </>
          )}
        </p>
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
