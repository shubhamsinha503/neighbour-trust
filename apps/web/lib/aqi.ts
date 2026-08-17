/**
 * AQI band presentation. The band itself is computed server-side (CPCB's table
 * lives in agents/air_quality/aqi.py and is the only place it lives); this maps a
 * band onto the mockup's reserved status ramp and the words CPCB uses.
 */

import type { AqiBand, Confidence } from "@schema/envelope";

export const BAND_COLOR: Record<AqiBand, string> = {
  good: "var(--color-status-good)",
  satisfactory: "var(--color-status-good)",
  moderate: "var(--color-status-warning)",
  poor: "var(--color-status-serious)",
  very_poor: "var(--color-status-critical)",
  severe: "var(--color-status-severe)",
};

export const BAND_LABEL: Record<AqiBand, string> = {
  good: "Good",
  satisfactory: "Satisfactory",
  moderate: "Moderate",
  poor: "Poor",
  very_poor: "Very Poor",
  severe: "Severe",
};

/** Band for an arbitrary AQI — used to colour individual points on the trend. */
export function bandForAqi(aqi: number): AqiBand {
  if (aqi <= 50) return "good";
  if (aqi <= 100) return "satisfactory";
  if (aqi <= 200) return "moderate";
  if (aqi <= 300) return "poor";
  if (aqi <= 400) return "very_poor";
  return "severe";
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
  community_estimated: "Community-estimated",
};

/**
 * Confidence dot colours, matching the mockup's category cards. Note
 * community-estimated is violet rather than a status colour — it isn't "worse
 * data", it's a different *kind* of data, and colouring it red would misrepresent
 * residents as a failure state.
 */
export const CONFIDENCE_COLOR: Record<Confidence, string> = {
  high: "var(--color-status-good)",
  medium: "var(--color-status-warning)",
  low: "var(--color-status-serious)",
  community_estimated: "var(--color-series-violet)",
};

export function formatIst(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function relativeAge(iso: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
