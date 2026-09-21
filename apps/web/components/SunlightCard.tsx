"use client";

/**
 * Sunlight and orientation for a locality.
 *
 * Pure astronomy: everything here is computed from the locality's latitude and
 * longitude with SunCalc, so it is exact and works for every locality with no
 * data pipeline behind it. That is the point — it is the opposite of the press
 * data, which is a signal; this is a fact.
 *
 * What it deliberately does not claim: whether a *specific* flat gets sun. That
 * depends on the floor and the buildings around it, which we have no reliable
 * height data for. So the card gives the sun's path for the locality and a
 * facing-direction helper, and says plainly where its knowledge stops.
 *
 * The installed `suncalc` build returns azimuth as a compass bearing in degrees
 * from north (0 = N, 90 = E, 180 = S, 270 = W) and altitude in degrees —
 * verified against Bengaluru — so no radian conversion is applied here.
 */

import { useState } from "react";
import * as SunCalc from "suncalc";

const COMPASS_16 = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

function compass(deg: number): string {
  return COMPASS_16[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

function fmt(d: Date): string {
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
type Facing = (typeof DIRECTIONS)[number];

// Honest for Indian latitudes: the sun always rises in the east and sets in the
// west, so morning/afternoon exposure is certain; the midday direction (south,
// mostly) is where it is softer.
const FACING_LIGHT: Record<Facing, string> = {
  N: "Soft, even daylight and the least direct sun — the coolest exposure.",
  NE: "Gentle morning sun, then indirect light for most of the day.",
  E: "Strong morning sun; shaded, cooler afternoons.",
  SE: "Morning and midday sun — bright and warm.",
  S: "Sun through the middle of the day — the most consistent daylight all year.",
  SW: "Harsh afternoon sun; the hottest exposure in summer.",
  W: "Strong late-afternoon and evening sun; hot through the summer.",
  NW: "Indirect for most of the day, with some evening sun in summer.",
};

export function SunlightCard({
  name,
  lat,
  lon,
}: {
  name: string;
  lat: number;
  lon: number;
}) {
  const [facing, setFacing] = useState<Facing | null>(null);
  const now = new Date();
  const times = SunCalc.getTimes(now, lat, lon);
  const sunrise = times.sunrise;
  const sunset = times.sunset;
  const solarNoon = times.solarNoon;

  // A locality inside a polar day/night, or a bad coordinate, yields no times.
  // Not possible for India, but the guard also narrows the nullable types.
  if (
    !sunrise ||
    !sunset ||
    !solarNoon ||
    Number.isNaN(sunrise.getTime()) ||
    Number.isNaN(sunset.getTime())
  ) {
    return null;
  }

  const riseAz = SunCalc.getPosition(sunrise, lat, lon).azimuth;
  const setAz = SunCalc.getPosition(sunset, lat, lon).azimuth;
  const noonAlt = SunCalc.getPosition(solarNoon, lat, lon).altitude;

  const dayMs = sunset.getTime() - sunrise.getTime();
  const dayH = Math.floor(dayMs / 3_600_000);
  const dayM = Math.round((dayMs % 3_600_000) / 60_000);

  // The seasonal swing: where the sunrise sits at the two solstices.
  const year = now.getFullYear();
  const summerRiseAt = SunCalc.getTimes(new Date(year, 5, 21), lat, lon).sunrise ?? sunrise;
  const winterRiseAt = SunCalc.getTimes(new Date(year, 11, 21), lat, lon).sunrise ?? sunrise;
  const summerRise = SunCalc.getPosition(summerRiseAt, lat, lon).azimuth;
  const winterRise = SunCalc.getPosition(winterRiseAt, lat, lon).azimuth;

  // Sun-height curve across today, sampled from the real position.
  const N = 40;
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= N; i++) {
    const t = new Date(sunrise.getTime() + (dayMs * i) / N);
    const alt = Math.max(0, SunCalc.getPosition(t, lat, lon).altitude);
    // x: 24..296 across the daylight span. y: horizon at 92, scaled by 90°.
    pts.push({ x: 24 + (i / N) * 272, y: 92 - (alt / 90) * 74 });
  }
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  const isDay = now >= sunrise && now <= sunset;
  const nowFrac = Math.min(1, Math.max(0, (now.getTime() - sunrise.getTime()) / dayMs));
  const nowX = 24 + nowFrac * 272;
  const nowAlt = Math.max(0, SunCalc.getPosition(now, lat, lon).altitude);
  const nowY = 92 - (nowAlt / 90) * 74;

  return (
    <section className="mt-4 rounded-[20px] border border-hairline bg-surface-1 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.05em] text-brand">
        Sunlight &amp; orientation
      </div>
      <h2 className="text-[14.5px] font-semibold leading-[1.4] text-ink-primary">
        Rises in the {compass(riseAz)}, sets in the {compass(setAz)} — {Math.round(noonAlt)}°
        overhead at midday.
      </h2>

      {/* Sun-height curve for today, drawn from the real position. */}
      <svg viewBox="0 0 320 108" className="mt-4 w-full" role="img" aria-label={`The sun's height through the day in ${name}`}>
        <line x1="16" y1="92" x2="304" y2="92" stroke="var(--color-gridline)" strokeWidth="1" />
        <path d={path} fill="none" stroke="#EF9F27" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="24" cy="92" r="3" fill="#EF9F27" />
        <circle cx="296" cy="92" r="3" fill="#EF9F27" />
        {isDay && <circle cx={nowX} cy={nowY} r="5" fill="#EF9F27" stroke="var(--color-surface-1)" strokeWidth="1.5" />}
        <text x="24" y="104" textAnchor="middle" fill="var(--color-ink-muted)" style={{ fontSize: 9 }}>
          {fmt(sunrise)}
        </text>
        <text x="160" y="104" textAnchor="middle" fill="var(--color-ink-muted)" style={{ fontSize: 9 }}>
          {dayH}h {dayM}m of daylight
        </text>
        <text x="296" y="104" textAnchor="middle" fill="var(--color-ink-muted)" style={{ fontSize: 9 }}>
          {fmt(sunset)}
        </text>
      </svg>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Sunrise" value={fmt(sunrise)} sub={`in the ${compass(riseAz)}`} />
        <Stat label="Sunset" value={fmt(sunset)} sub={`in the ${compass(setAz)}`} />
        <Stat label="Midday sun" value={`${Math.round(noonAlt)}°`} sub="above the horizon" />
      </div>

      <p className="mt-3 text-[11.5px] leading-[1.55] text-ink-secondary">
        Across the year the sunrise swings from the {compass(summerRise)} in June to the{" "}
        {compass(winterRise)} in December.
      </p>

      {/* Facing helper — the part a buyer actually decides on. */}
      <div className="mt-4 border-t border-gridline pt-4">
        <div className="text-[11.5px] font-semibold text-ink-primary">
          Which way does the home face?
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DIRECTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setFacing(d === facing ? null : d)}
              className={
                "rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors " +
                (d === facing
                  ? "bg-brand text-white"
                  : "bg-page-plane text-ink-secondary hover:bg-brand-soft")
              }
            >
              {d}
            </button>
          ))}
        </div>
        {facing && (
          <p className="mt-2.5 rounded-2xl bg-brand-soft px-3.5 py-2.5 text-[12px] leading-[1.55] text-ink-primary">
            {FACING_LIGHT[facing]}
          </p>
        )}
      </div>

      <p className="mt-4 text-[10.5px] leading-[1.55] text-ink-muted">
        This is the sun&apos;s path for {name}. How a specific flat is lit also
        depends on its floor and the buildings around it —{" "}
        <a
          href={`https://app.shadowmap.org/?lat=${lat}&lng=${lon}&zoom=17`}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-brand hover:underline"
        >
          see it in 3D sun &amp; shadow →
        </a>
      </p>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl bg-page-plane px-3 py-2.5">
      <div className="text-[9.5px] font-medium uppercase tracking-[0.04em] text-ink-muted">
        {label}
      </div>
      <div className="mt-0.5 text-[15px] font-bold leading-none text-ink-primary">{value}</div>
      <div className="mt-1 text-[10px] leading-[1.3] text-ink-secondary">{sub}</div>
    </div>
  );
}
