"use client";

/**
 * What is already built near a locality — and, if the reader gives an address,
 * how far it is from *there*.
 *
 * This card shows what exists today, not RERA registrations or upcoming
 * projects. docs/strategy.md scopes the infrastructure category to the latter;
 * that remains the ambition and is a scraping problem. Saying which of the two
 * this is, on the card, is the difference between a substitution and a
 * redefinition.
 *
 * Two numbers behave differently when an address is given, and the distinction
 * is the honest part of this component:
 *
 *   - **Nearest distances are re-measured.** The nearest station to an address
 *     inside the locality is inside the circle we already fetched, so the answer
 *     is exact rather than approximate.
 *   - **Counts are not.** They were gathered in a circle around the centroid, so
 *     recounting them from a point offset from it would miss everything on the
 *     far side and produce a number that looks measured and is not. They stay
 *     labelled as locality-wide.
 *
 * The score is not recomputed either. It is a locality score that feeds the
 * Trust Score, and a second per-address version of it would sit on the page
 * disagreeing with the first.
 */

import { useState } from "react";
import { CONFIDENCE_COLOR, CONFIDENCE_LABEL, relativeAge } from "@/lib/aqi";
import { LocalityMap } from "@/components/LocalityMap";
import { MeasureFrom, haversineKm, type Origin } from "@/components/MeasureFrom";
import type { ConnectivityFeature, ConnectivityView } from "@/lib/api";

const KIND_LABEL: Record<ConnectivityFeature["kind"], string> = {
  metro_rail: "Station",
  hospitals: "Hospital",
  clinics: "Clinic",
  parks: "Park",
  markets: "Supermarket",
  industrial_sites: "Industrial land",
};

/** Nearest feature of a kind to a point, or undefined if there is none. */
export function nearestOf(
  features: ConnectivityFeature[],
  kind: ConnectivityFeature["kind"],
  from: { lat: number; lon: number },
): { km: number; name?: string } | undefined {
  let best: { km: number; name?: string } | undefined;
  for (const f of features) {
    if (f.kind !== kind) continue;
    const km = haversineKm(from.lat, from.lon, f.lat, f.lon);
    if (!best || km < best.km) best = { km, name: f.name };
  }
  return best;
}

export function ConnectivityCard({ view }: { view: ConnectivityView }) {
  const [origin, setOrigin] = useState<Origin | null>(null);
  const { locality, counts, nearest, features } = view;

  const canMeasure = features.length > 0;
  const from = origin ?? { lat: locality.lat, lon: locality.lon };

  // Recomputed when we have the features; otherwise the stored centroid
  // distances stand, which is what older envelopes carry.
  const rows: Array<{
    kind: ConnectivityFeature["kind"];
    km?: number;
    name?: string;
    count: number;
  }> = (
    [
      ["metro_rail", nearest.stationKm, counts.metroRail],
      ["hospitals", nearest.hospitalKm, counts.hospitals],
      ["parks", nearest.parkKm, counts.parks],
      ["industrial_sites", nearest.industryKm, counts.industrialSites],
    ] as const
  ).map(([kind, storedKm, count]) => {
    const live = canMeasure ? nearestOf(features, kind, from) : undefined;
    return {
      kind,
      km: live ? live.km : storedKm,
      name: live?.name,
      count,
    };
  });

  return (
    <article className="rounded-[20px] border border-hairline bg-surface-1 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <header className="mb-4 flex items-start gap-4">
        {view.score !== undefined && <Meter score={view.score} />}
        <div>
          <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.05em] text-brand">
            What is already built nearby
          </div>
          <h2 className="text-[14.5px] font-semibold leading-[1.4] text-ink-primary">
            {view.summary}
          </h2>
        </div>
      </header>

      {/* Above the address box on purpose. The map is the answer to "what is it
          like around here", which is the question that brought someone to the
          page; measuring from a specific address is a refinement of it. */}
      <LocalityMap
        localityName={locality.name}
        lat={locality.lat}
        lon={locality.lon}
        features={view.features}
      />

      {canMeasure ? (
        <MeasureFrom
          localityName={locality.name}
          city={locality.city}
          centroid={{ lat: locality.lat, lon: locality.lon }}
          origin={origin}
          onChange={setOrigin}
        />
      ) : (
        <p className="rounded-2xl border border-hairline bg-page-plane p-3 text-[11px] leading-[1.5] text-ink-secondary">
          Distances here are measured from the centre of {locality.name}. This
          locality&apos;s data predates per-feature coordinates, so it cannot yet
          be re-measured from an address — the next weekly refresh will fix that.
        </p>
      )}

      <ul className="mt-4 flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.kind}
            className="flex items-baseline justify-between gap-3 border-b border-gridline pb-2 last:border-0"
          >
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-ink-primary">
                {KIND_LABEL[row.kind]}
                {row.name ? (
                  <span className="font-normal text-ink-secondary"> · {row.name}</span>
                ) : null}
              </div>
              <div className="text-[10.5px] text-ink-muted">
                {row.count} within the locality
              </div>
            </div>
            <div className="shrink-0 text-right">
              {row.km !== undefined ? (
                <div className="text-[13px] font-bold text-ink-primary">
                  {row.km.toFixed(2)} km
                </div>
              ) : (
                /* The absence is the finding: nothing of this kind was mapped
                   inside the search radius at all. */
                <div className="text-[11px] text-ink-muted">none nearby</div>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-4 rounded-2xl bg-brand-soft px-3.5 py-3">
        <b className="text-[12px] text-brand-deep">What this does and does not say</b>
        <p className="mt-1 text-[11.5px] leading-[1.5] text-ink-secondary">
          {view.scopeNote}
          {origin
            ? " Distances are measured from your address; the counts beside them" +
              " describe the whole locality and are not recounted from it, because" +
              " they were gathered in a circle around the centre."
            : ""}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-gridline pt-3">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-ink-secondary">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: CONFIDENCE_COLOR[view.confidence] }}
            aria-hidden="true"
          />
          {CONFIDENCE_LABEL[view.confidence]}
        </span>
        <span className="text-[10px] text-ink-muted">
          {view.sourceName} · mapped {relativeAge(view.dataVintage)}
        </span>
      </div>
    </article>
  );
}

function Meter({ score }: { score: number }) {
  const color =
    score >= 75
      ? "var(--color-status-good)"
      : score >= 55
        ? "var(--color-status-warning)"
        : "var(--color-status-serious)";
  return (
    <div
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[3px] text-[17px] font-bold"
      style={{ borderColor: color, color }}
    >
      {score}
    </div>
  );
}
