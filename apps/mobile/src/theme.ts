/**
 * Design tokens, carried over from the web app's v2 mockup so the native app
 * reads as the same product. Kept as a plain object because React Native has no
 * CSS variables — components import these directly.
 */
export const theme = {
  brand: "#FF2D78",
  brandDeep: "#c01f5c",
  brandSoft: "#ffe4ee",
  page: "#FBFBFA",
  surface: "#ffffff",
  plane: "#f3f2ee",
  hairline: "#e7e6e0",
  ink: "#1a1a17",
  inkSecondary: "#5b5b54",
  inkMuted: "#9a9a90",
  good: "#1baf7a",
  warn: "#c9860a",
  bad: "#c0442c",
} as const;

/** Trust-score colour, matching the web report's thresholds. */
export function scoreColor(score: number | null): string {
  if (score === null) return theme.inkMuted;
  return score >= 75 ? theme.brand : score >= 55 ? theme.warn : theme.bad;
}
