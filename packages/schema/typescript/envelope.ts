/**
 * Shared data envelope every category agent returns — TypeScript mirror of
 * packages/schema/python/neighbour_trust_schema/envelope.py, for the Next.js
 * frontend and any Node-side tooling.
 *
 * Keep this in sync with envelope.py by hand until the repo has a codegen step;
 * they intentionally use the same field semantics (camelCase here vs snake_case
 * in Python) so a diff between the two is easy to eyeball.
 *
 * NOTE: the API serializes snake_case. `apps/web/lib/api.ts` does the one
 * conversion at the fetch boundary so components only ever see these types.
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
  /** H3 index (resolution 9) this data point is keyed to. */
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

/**
 * CPCB National AQI bands — deliberately CPCB's six-band scale, not the US EPA's.
 * The same PM2.5 concentration lands in a different band under each, and an Indian
 * buyer cross-checking against a CPCB bulletin must see the same word we do.
 */
export type AqiBand =
  | "good"
  | "satisfactory"
  | "moderate"
  | "poor"
  | "very_poor"
  | "severe";

/** One day of the 30-day trend. Carries its date so gaps render as gaps. */
export interface TrendPoint {
  /** ISO date, YYYY-MM-DD. */
  day: string;
  aqi: number;
  /** Hourly observations this daily value was averaged from. */
  observationCount: number;
}

export interface AirQualityPayload {
  /**
   * CPCB National AQI from 24-hour mean concentrations, which is how CPCB
   * defines it — not the latest single hour. See latestHourAqi.
   */
  currentAqi: number;
  aqiBand: AqiBand;
  /** Averaging window behind currentAqi, e.g. "24h_rolling". */
  aqiBasis: string;
  /** AQI of the most recent single hour — context, never the headline. */
  latestHourAqi?: number;
  /** Pollutant whose sub-index set the AQI — CPCB AQI is a max, not an average. */
  dominantPollutant?: string;

  pm25?: number;
  pm10?: number;
  no2?: number;
  so2?: number;
  /** mg/m³ — CPCB reports CO in mg/m³, not µg/m³. */
  co?: number;
  o3?: number;
  nh3?: number;

  stationName?: string;
  nearestStationKm?: number;
  /** ISO 8601 — when the station actually measured this, distinct from fetchedAt. */
  observedAt?: string;

  trend30d: TrendPoint[];
  /** Every upstream that contributed, e.g. ["CPCB via data.gov.in", "OpenAQ"]. */
  sourcesUsed: string[];
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
