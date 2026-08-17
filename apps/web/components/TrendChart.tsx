"use client";

/**
 * 30-day AQI trend.
 *
 * Design decisions worth not undoing:
 *   * **One series, so no legend** — the title names it. A legend box for a
 *     single line is furniture.
 *   * **Gaps are drawn as gaps.** Stations go offline; the path breaks rather
 *     than interpolating a straight line across three missing days, which would
 *     invent readings that were never taken.
 *   * **The line is one colour, not a gradient through the AQI bands.** The
 *     band context comes from the labelled reference lines behind it; recolouring
 *     the line per point makes a noisy series look like a categorical one.
 *   * **Thin days are marked.** A day averaged from four readings gets a hollow
 *     marker, because it is a weaker claim than one averaged from ninety-six.
 *   * A table view sits under the chart for screen readers and for anyone who
 *     wants the numbers.
 */

import { useMemo, useState } from "react";
import type { TrendPoint } from "@schema/envelope";
import { BAND_LABEL, bandForAqi } from "@/lib/aqi";

const WIDTH = 680;
const HEIGHT = 220;
// The right gutter is wide on purpose: the band labels ("Moderate",
// "Satisfactory", …) live there, and at a 16px pad the series ran underneath
// them and became unreadable at exactly the values a reader most wants to check.
const PAD = { top: 16, right: 72, bottom: 28, left: 38 };

// CPCB band ceilings, drawn as recessive reference lines so a reader can place
// the line without consulting a legend.
const BAND_LINES = [
  { value: 50, label: "Good" },
  { value: 100, label: "Satisfactory" },
  { value: 200, label: "Moderate" },
  { value: 300, label: "Poor" },
  { value: 400, label: "Very Poor" },
];

// Below this many hourly readings, a day is drawn as provisional.
const THIN_DAY = 12;

interface Props {
  points: TrendPoint[];
}

export function TrendChart({ points }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const model = useMemo(() => buildModel(points), [points]);

  if (model === null) {
    return (
      <p className="text-[11.5px] leading-relaxed text-ink-secondary">
        Not enough history yet to draw a trend. The agent stores every hourly
        reading, so this chart fills in as data accumulates.
      </p>
    );
  }

  const { plotted, xFor, yFor, segments, yTicks, domainDays } = model;
  const hovered = hoverIndex === null ? null : plotted[hoverIndex];

  function handleMove(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    // The SVG scales with its container, so convert the pointer back into
    // viewBox units before comparing against point positions.
    const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let best = Infinity;
    plotted.forEach((point, index) => {
      const distance = Math.abs(xFor(point.dayIndex) - x);
      if (distance < best) {
        best = distance;
        nearest = index;
      }
    });
    setHoverIndex(nearest);
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="chart-focusable w-full"
        role="img"
        aria-label={`Daily air quality index over the last ${domainDays} days, ${plotted.length} days with data.`}
        tabIndex={0}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") {
            setHoverIndex((i) => Math.min(plotted.length - 1, (i ?? -1) + 1));
          } else if (event.key === "ArrowLeft") {
            setHoverIndex((i) => Math.max(0, (i ?? plotted.length) - 1));
          } else if (event.key === "Escape") {
            setHoverIndex(null);
          }
        }}
      >
        {/* Band reference lines — recessive, behind the data. */}
        {BAND_LINES.filter((band) => band.value <= yTicks.max).map((band) => (
          <g key={band.value}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={yFor(band.value)}
              y2={yFor(band.value)}
              stroke="var(--color-gridline)"
              strokeWidth={1}
              strokeDasharray="3 4"
            />
            <text
              x={WIDTH - PAD.right + 6}
              y={yFor(band.value) + 3}
              className="fill-ink-muted"
              fontSize={9}
            >
              {band.label}
            </text>
          </g>
        ))}

        {/* Y axis labels only — no axis rule, the band lines carry the structure. */}
        {yTicks.values.map((value) => (
          <text
            key={value}
            x={PAD.left - 8}
            y={yFor(value) + 3}
            textAnchor="end"
            className="fill-ink-muted"
            fontSize={9.5}
          >
            {value}
          </text>
        ))}

        {/* Baseline. */}
        <line
          x1={PAD.left}
          x2={WIDTH - PAD.right}
          y1={HEIGHT - PAD.bottom}
          y2={HEIGHT - PAD.bottom}
          stroke="var(--color-baseline)"
          strokeWidth={1}
        />

        {/* The series. One path per unbroken run of days. */}
        {segments.map((segment, index) => (
          <path
            key={index}
            d={segment}
            fill="none"
            stroke="var(--color-brand)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Provisional days: hollow markers, so a thin average is visibly thin. */}
        {plotted
          .filter((point) => point.observationCount < THIN_DAY)
          .map((point) => (
            <circle
              key={`thin-${point.day}`}
              cx={xFor(point.dayIndex)}
              cy={yFor(point.aqi)}
              r={2.5}
              fill="var(--color-surface-1)"
              stroke="var(--color-brand)"
              strokeWidth={1.5}
            />
          ))}

        {/* Hover crosshair. */}
        {hovered && (
          <g pointerEvents="none">
            <line
              x1={xFor(hovered.dayIndex)}
              x2={xFor(hovered.dayIndex)}
              y1={PAD.top}
              y2={HEIGHT - PAD.bottom}
              stroke="var(--color-baseline)"
              strokeWidth={1}
            />
            <circle
              cx={xFor(hovered.dayIndex)}
              cy={yFor(hovered.aqi)}
              r={5}
              fill="var(--color-brand)"
              stroke="var(--color-surface-1)"
              strokeWidth={2}
            />
          </g>
        )}

        {/* X axis: first and last day only. A label per day would be unreadable
            at this width and adds nothing — the tooltip carries exact dates. */}
        <text
          x={PAD.left}
          y={HEIGHT - PAD.bottom + 15}
          className="fill-ink-muted"
          fontSize={9.5}
        >
          {shortDate(plotted[0].day)}
        </text>
        <text
          x={WIDTH - PAD.right}
          y={HEIGHT - PAD.bottom + 15}
          textAnchor="end"
          className="fill-ink-muted"
          fontSize={9.5}
        >
          {shortDate(plotted[plotted.length - 1].day)}
        </text>
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-hairline bg-surface-1 px-2.5 py-1.5 shadow-sm"
          style={{
            left: `${(xFor(hovered.dayIndex) / WIDTH) * 100}%`,
            top: 0,
          }}
        >
          <div className="text-[10px] font-semibold text-ink-primary">
            {longDate(hovered.day)}
          </div>
          <div className="text-[11px] text-ink-secondary">
            AQI {Math.round(hovered.aqi)} · {BAND_LABEL[bandForAqi(hovered.aqi)]}
          </div>
          <div className="text-[9.5px] text-ink-muted">
            {hovered.observationCount} reading
            {hovered.observationCount === 1 ? "" : "s"} that day
          </div>
        </div>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-[10.5px] text-ink-muted">
          View as table
        </summary>
        <table className="mt-2 w-full text-left text-[10.5px] text-ink-secondary">
          <thead className="text-ink-muted">
            <tr>
              <th className="py-1 font-medium">Date</th>
              <th className="py-1 font-medium">AQI</th>
              <th className="py-1 font-medium">Band</th>
              <th className="py-1 font-medium">Readings</th>
            </tr>
          </thead>
          <tbody>
            {plotted.map((point) => (
              <tr key={point.day} className="border-t border-gridline">
                <td className="py-1">{longDate(point.day)}</td>
                <td className="py-1">{Math.round(point.aqi)}</td>
                <td className="py-1">{BAND_LABEL[bandForAqi(point.aqi)]}</td>
                <td className="py-1">{point.observationCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface PlottedPoint extends TrendPoint {
  /** Days since the start of the domain — the x position, so absent days leave
      a real horizontal gap rather than being squeezed out. */
  dayIndex: number;
}

function buildModel(points: TrendPoint[]) {
  const sorted = [...points]
    .filter((point) => Number.isFinite(point.aqi))
    .sort((a, b) => a.day.localeCompare(b.day));

  if (sorted.length < 2) return null;

  const start = Date.parse(`${sorted[0].day}T00:00:00Z`);
  const end = Date.parse(`${sorted[sorted.length - 1].day}T00:00:00Z`);
  const domainDays = Math.max(1, Math.round((end - start) / 86_400_000));

  const plotted: PlottedPoint[] = sorted.map((point) => ({
    ...point,
    dayIndex: Math.round(
      (Date.parse(`${point.day}T00:00:00Z`) - start) / 86_400_000,
    ),
  }));

  const maxAqi = Math.max(...plotted.map((p) => p.aqi));
  const yMax = niceCeiling(Math.max(60, maxAqi * 1.12));

  const xFor = (dayIndex: number) =>
    PAD.left +
    (dayIndex / domainDays) * (WIDTH - PAD.left - PAD.right);
  const yFor = (aqi: number) =>
    HEIGHT - PAD.bottom - (aqi / yMax) * (HEIGHT - PAD.top - PAD.bottom);

  // Split into runs of consecutive days so missing days break the line.
  const segments: string[] = [];
  let current: PlottedPoint[] = [];
  plotted.forEach((point, index) => {
    const previous = plotted[index - 1];
    if (previous && point.dayIndex - previous.dayIndex > 1) {
      if (current.length) segments.push(toPath(current, xFor, yFor));
      current = [];
    }
    current.push(point);
  });
  if (current.length) segments.push(toPath(current, xFor, yFor));

  return {
    plotted,
    xFor,
    yFor,
    segments,
    domainDays: domainDays + 1,
    yTicks: { max: yMax, values: tickValues(yMax) },
  };
}

function toPath(
  run: PlottedPoint[],
  xFor: (d: number) => number,
  yFor: (a: number) => number,
): string {
  if (run.length === 1) {
    // A lone day between two gaps still deserves to be visible.
    const x = xFor(run[0].dayIndex);
    const y = yFor(run[0].aqi);
    return `M ${x - 1} ${y} L ${x + 1} ${y}`;
  }
  return run
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${xFor(point.dayIndex).toFixed(1)} ${yFor(point.aqi).toFixed(1)}`,
    )
    .join(" ");
}

function niceCeiling(value: number): number {
  const steps = [60, 100, 150, 200, 250, 300, 350, 400, 500];
  return steps.find((step) => step >= value) ?? 500;
}

function tickValues(max: number): number[] {
  const step = max <= 100 ? 25 : max <= 200 ? 50 : 100;
  const values: number[] = [];
  for (let value = 0; value <= max; value += step) values.push(value);
  return values;
}

function shortDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function longDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
