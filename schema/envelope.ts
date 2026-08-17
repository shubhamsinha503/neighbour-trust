/**
 * Shared data envelope every category agent returns — TypeScript mirror of
 * schema/envelope.py, for the Next.js frontend and any Node-side tooling.
 *
 * Mirrors the agent specification in docs/strategy.md ("Agent specification,
 * per category"). Keep this in sync with envelope.py by hand until the repo
 * has a codegen step; they intentionally use the same field semantics
 * (camelCase here vs snake_case in Python) so a diff between the two is easy
 * to eyeball.
 */

export type Confidence = "high" | "medium" | "low" | "community_estimated";

export type Category =
  | "schools"
  | "crime"
  | "air_quality"
  | "water"
  | "power"
  | "infrastructure";

export interface DataEnvelope<TPayload = Record<string, unknown>> {
  category: Category;
  sourceName: string;
  sourceUrl?: string;
  /** ISO 8601 — when the agent last pulled this data. */
  fetchedAt: string;
  /** ISO 8601 — how old the underlying data actually is, not when it was fetched. */
  dataVintage: string;
  /** H3 index (resolution 9 recommended) this data point is keyed to. */
  h3Cell: string;
  confidence: Confidence;
  payload: TPayload;
}

// ---- Category-specific payloads (see docs/strategy.md for source lists per category) ----

export interface SchoolsPayload {
  name: string;
  board?: string;
  distanceKm?: number;
  pupilTeacherRatio?: number;
  infraScore?: number;
  passRate?: number;
}

export interface CrimePayload {
  /** Always district-level per NCRB — never present as locality-specific. */
  officialCrimeRateDistrict?: number;
  residentReports90dCount: number;
  blendedSafetyPerceptionScore?: number;
}

export interface AirQualityPayload {
  currentAqi: number;
  pm25?: number;
  pm10?: number;
  nearestStationKm?: number;
  trend30d?: number[];
}

export interface WaterPayload {
  reportedSupplyFrequency?: string;
  groundwaterTrend?: string;
  tankerDependencyPct?: number;
}

export interface PowerPayload {
  avgOutageHoursPerWeekReported?: number;
  officialDataAvailable: boolean;
}

export interface InfraProject {
  name: string;
  type: string;
  expectedCompletion?: string;
  source: string;
  confidence: Confidence;
}

export interface InfrastructurePayload {
  nearbyReraProjects: InfraProject[];
  upcomingInfraWithin5km: InfraProject[];
  builderTrackRecordScore?: number;
}
