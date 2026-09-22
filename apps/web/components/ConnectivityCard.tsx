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
import { CONFIDENCE_COLOR, CONFIDENCE_LABEL } from "@/lib/aqi";
import { MeasureFrom, haversineKm, type Origin } from "@/components/MeasureFrom";
import type { ConnectivityFeature, ConnectivityView } from "@/lib/api";

function distanceText(km: number): string {
  const m = km * 1000;
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${km.toFixed(1)} km`;
}

/** ~80 m/min is an unhurried walk; past a quarter-hour it is really a drive. */
function walkText(km: number): string {
  const mins = Math.max(1, Math.round((km * 1000) / 80));
  return mins <= 15 ? `~${mins} min walk` : "a short drive";
}

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

  // The amenities a buyer weighs, each as its nearest with a walk time.
  // Re-measured from the reader's address when given, otherwise from the
  // centroid; older envelopes without per-feature coordinates keep the stored
  // centroid distance where one exists. Industrial land is not an amenity, so
  // it is a footnote below rather than a row.
  const storedKm: Record<string, number | undefined> = {
    metro_rail: nearest.stationKm,
    hospitals: nearest.hospitalKm,
    parks: nearest.parkKm,
  };
  const rows = (
    [
      ["hospitals", "Hospitals", counts.hospitals],
      ["parks", "Parks", counts.parks],
      ["markets", "Supermarkets", counts.markets],
      ["clinics", "Clinics", counts.clinics],
      ["metro_rail", "Transit stations", counts.metroRail],
    ] as const
  )
    .map(([kind, label, count]) => {
      const live = canMeasure ? nearestOf(features, kind, from) : undefined;
      return {
        kind,
        label,
        count,
        km: live ? live.km : storedKm[kind],
        name: live?.name,
      };
    })
    .filter((row) => row.count > 0);

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

      {/* The amenity-icon map is gone — a dot cloud looked like information and
          was noise. The nearest-distance list below answers what a reader came
          to ask; the address box refines it. */}
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

      <ul className="mt-4 flex flex-col">
        {rows.map((row) => (
          <li
            key={row.kind}
            className="flex items-baseline justify-between gap-3 border-b border-gridline py-2 last:border-0"
          >
            <div className="min-w-0">
              <div className="text-[12.5px] font-medium text-ink-primary">
                {row.label}
                {row.name ? (
                  <span className="font-normal text-ink-secondary"> · {row.name}</span>
                ) : null}
              </div>
              <div className="text-[10.5px] font-medium text-brand">{row.count} nearby</div>
            </div>
            <div className="shrink-0 text-right">
              {row.km !== undefined ? (
                <>
                  <div className="text-[13px] font-bold text-ink-primary">
                    {distanceText(row.km)}
                  </div>
                  <div className="text-[10px] font-medium text-brand">
                    nearest · {walkText(row.km)}
                  </div>
                </>
              ) : (
                <div className="text-[11px] font-medium text-brand">count only</div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {counts.industrialSites > 0 && (
        <p className="mt-2 text-[10.5px] font-medium leading-[1.5] text-brand">
          Also nearby: {counts.industrialSites} industrial{" "}
          {counts.industrialSites === 1 ? "site" : "sites"} — worth noting for a
          home.
        </p>
      )}
      {origin && (
        <p className="mt-2 text-[10px] leading-[1.5] text-ink-muted">
          Distances are measured from your address; counts describe the whole
          locality.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-gridline pt-3">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-ink-secondary">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: CONFIDENCE_COLOR[view.confidence] }}
            aria-hidden="true"
          />
          {CONFIDENCE_LABEL[view.confidence]}
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
