/**
 * Design tokens for the native app, matching the v3 product mockup so the app
 * reads as one coherent design. React Native has no CSS variables, so components
 * import these values directly.
 *
 * The older token names (brand, ink, inkSecondary, …) are kept as aliases onto
 * the new palette so screens and components written against the previous theme
 * keep working while the redesign lands screen by screen.
 */
export const theme = {
  // Brand / accent
  brand: "#F72575",
  brandDeep: "#C81C5E",
  brandLight: "#FFB3CC",
  brandSoft: "#FFE4EC",

  // Surfaces
  page: "#F8FAFC",
  surface: "#FFFFFF",
  plane: "#F1F5F9",
  hairline: "#E2E8F0",

  // Text (slate scale)
  ink: "#0F172A",
  inkSecondary: "#475569",
  inkMuted: "#64748B",

  // Status / bands
  good: "#16A34A",
  warn: "#D97706",
  orange: "#EA580C",
  bad: "#DC2626",

  // Extra series colour used for community-sourced confidence
  violet: "#7C3AED",
} as const;

/**
 * Dot colour per confidence level, matching the website's provenance palette.
 * Keyed by the exact `confidence` strings the API returns.
 */
export const CONFIDENCE_COLOR: Record<string, string> = {
  high: theme.good,
  medium: theme.warn,
  low: theme.orange,
  community_estimated: theme.violet,
};

/** Font family names registered by expo-font (see app/_layout.tsx). */
export const font = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  extrabold: "Inter_800ExtraBold",
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export type ScoreBand = "good" | "moderate" | "poor" | "veryPoor";

/** Which band a 0–100 score falls into. Null scores read as "veryPoor" visually. */
export function scoreBand(score: number | null): ScoreBand {
  if (score === null) return "veryPoor";
  if (score >= 75) return "good";
  if (score >= 55) return "moderate";
  if (score >= 35) return "poor";
  return "veryPoor";
}

const BAND_COLOR: Record<ScoreBand, string> = {
  good: theme.good,
  moderate: theme.warn,
  poor: theme.orange,
  veryPoor: theme.bad,
};

/** Ring / accent colour for a trust score, by band. */
export function scoreColor(score: number | null): string {
  if (score === null) return theme.inkMuted;
  return BAND_COLOR[scoreBand(score)];
}
