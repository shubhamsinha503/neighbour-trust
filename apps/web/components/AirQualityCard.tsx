/**
 * The air quality detail card.
 *
 * Follows design/mockup-v2-psychology.html, and the ordering is the part that
 * matters most — it encodes the reasoning in the consumer-psychology section of
 * docs/strategy.md:
 *
 *   1. Verdict headline + meter (interpretation before number)
 *   2. Stat tiles (the measurements)
 *   3. Trend chart (is it getting better or worse)
 *   4. Honesty note (the caveat, *after* competence is established — the pratfall
 *      effect only works in that order, never as an opening disclaimer)
 *   5. Source strip + confidence tag (the credibility engine, in the main flow
 *      rather than a footer, per Prominence-Interpretation Theory)
 */

import { useT } from "@/components/LanguageProvider";
import { bandLabel } from "@/lib/i18n";
import type { AirQualityPayload, Confidence } from "@schema/envelope";
import {
  BAND_COLOR,
  BAND_LABEL,
  bandForAqi,
  CONFIDENCE_COLOR,
  CONFIDENCE_LABEL,
  formatIst,
  relativeAge,
} from "@/lib/aqi";
import type { AirQualityView } from "@/lib/api";

export function AirQualityCard({ view }: { view: AirQualityView }) {
  const t = useT();
  const { payload, verdict, locality } = view;
  const bandColor = BAND_COLOR[payload.aqiBand];

  return (
    <article className="rounded-[20px] border border-hairline bg-surface-1 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      {/*
        0 — the one caveat that runs *before* the verdict.
        The ordering above is deliberate and the honesty note belongs at step 4,
        after competence is established. This is the exception, because it is not
        a caveat about our confidence — it changes what the number below means. A
        reader who sees "AQI 40 · Good" without knowing it was measured a
        fortnight ago has been told something false about the air today, and no
        footnote placed after the meter undoes that first impression.
      */}
      {view.historical && (
        <div
          className="mb-4 rounded-2xl border border-amber-300/60 bg-amber-50 px-3.5 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/10"
          role="status"
        >
          <div className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-amber-700 dark:text-amber-400">
            Last known reading
          </div>
          <p className="mt-0.5 text-[12.5px] leading-[1.5] text-ink-primary">
            Measured <b>{formatIst(view.dataVintage)}</b>, {relativeAge(view.dataVintage)}.
            The monitoring network has published nothing since, so this is not a
            reading for today and it is left out of the Trust Score.
          </p>
        </div>
      )}

      {/* 1 — verdict */}
      <header className="mb-4 flex items-start gap-4">
        <Meter score={verdict.score} color={bandColor} />
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
          label={t("aq.aqi24")}
          value={Math.round(payload.currentAqi).toString()}
          sub={bandLabel(t, payload.aqiBand, BAND_LABEL[payload.aqiBand])}
          accent={bandColor}
        />
        <StatTile
          label={t("aq.pm25")}
          value={payload.pm25 !== undefined ? payload.pm25.toFixed(1) : "—"}
          sub="µg/m³"
        />
        <StatTile
          label={t("aq.pm10")}
          value={payload.pm10 !== undefined ? payload.pm10.toFixed(1) : "—"}
          sub="µg/m³"
        />
        <StatTile
          label={payload.aqiBasis === "cams_model" ? t("aq.source") : t("aq.nearestStation")}
          value={
            payload.aqiBasis === "cams_model"
              ? t("aq.model")
              : payload.nearestStationKm !== undefined
                ? `${payload.nearestStationKm.toFixed(1)}`
                : "—"
          }
          sub={payload.aqiBasis === "cams_model" ? t("aq.noLiveStation") : t("aq.kmAway")}
        />
      </div>

      <p className="mt-3 text-[11.5px] text-ink-secondary">
        {payload.dominantPollutant && (
          <>
            Driven by{" "}
            <strong className="font-semibold">{payload.dominantPollutant}</strong>
          </>
        )}
        {payload.stationName && (
          <>
            {" "}
            · {payload.aqiBasis === "cams_model" ? "modelled by" : "measured at"}{" "}
            {payload.stationName}
          </>
        )}
        {payload.observedAt && <> · latest reading {relativeAge(payload.observedAt)}</>}
      </p>

      {/* The 24-hour figure is the headline because that's how CPCB defines the
          index. The latest hour is shown alongside it rather than hidden — it's
          what a resident standing outside right now is actually breathing, and
          the gap between the two is often large. */}
      {payload.latestHourAqi !== undefined && (
        <p className="mt-1.5 text-[11px] text-ink-muted">
          Most recent hour alone: AQI {Math.round(payload.latestHourAqi)} (
          {bandLabel(t, bandForAqi(payload.latestHourAqi), BAND_LABEL[bandForAqi(payload.latestHourAqi)])}). The headline figure
          averages the last 24 hours, which is how CPCB defines the index.
        </p>
      )}


      {/* 5 — sources and confidence, in the main flow */}
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

function Meter({ score, color }: { score: number; color: string }) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);

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
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-page-plane px-3 py-2.5">
      <div className="text-[10px] font-medium uppercase tracking-[0.04em] text-ink-muted">
        {label}
      </div>
      <div
        className="mt-1 text-[19px] font-bold leading-none"
        style={accent ? { color: accent } : undefined}
      >
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
