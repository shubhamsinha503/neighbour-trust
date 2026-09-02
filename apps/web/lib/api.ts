/**
 * API client.
 *
 * The API serializes snake_case (it's FastAPI, and the Python envelope is the
 * source of truth). The TypeScript envelope in packages/schema is camelCase.
 * Rather than let both spellings float around the component tree, conversion
 * happens here at the fetch boundary — so components only ever see the shapes
 * declared in @schema/envelope.
 */

import type {
  AirQualityPayload,
  AqiBand,
  Confidence,
  SchoolsAreaPayload,
  SchoolsPayload,
  TrendPoint,
} from "@schema/envelope";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export interface Locality {
  slug: string;
  name: string;
  city: string;
  state: string;
  pincode?: string;
  h3Cell: string;
  lat: number;
  lon: number;
  /** How many of the six categories hold data here. */
  categoriesWithData: number;
}

export interface Verdict {
  headline: string;
  eyebrow: string;
  bandLabel: string;
  score: number;
  trendDirection: "improving" | "worsening" | "steady" | null;
  caveat: string;
}

export interface AirQualityView {
  locality: Locality;
  sourceName: string;
  sourceUrl?: string;
  fetchedAt: string;
  dataVintage: string;
  h3Cell: string;
  confidence: Confidence;
  payload: AirQualityPayload;
  verdict: Verdict;
}

/** Thrown when the API has no data — a real answer, not an error to swallow. */
export class NoDataError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "NoDataError";
  }
}

export async function fetchLocalities(): Promise<Locality[]> {
  const response = await fetch(`${API_BASE}/api/v1/localities`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to load localities (${response.status})`);
  }
  const raw = (await response.json()) as Array<Record<string, unknown>>;
  return raw.map(toLocality);
}

export async function fetchAirQuality(slug: string): Promise<AirQualityView> {
  // AQI updates hourly upstream; revalidating every 5 minutes keeps the page
  // fresh without turning every visit into a database round-trip.
  const response = await fetch(
    `${API_BASE}/api/v1/localities/${slug}/air-quality`,
    { next: { revalidate: 300 } },
  );

  if (response.status === 404) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    throw new NoDataError(
      typeof detail === "string"
        ? detail
        : (detail?.reason ?? "No air quality data for this locality yet."),
    );
  }
  if (!response.ok) {
    throw new Error(`Failed to load air quality (${response.status})`);
  }

  const raw = (await response.json()) as Record<string, any>;
  return {
    locality: toLocality(raw.locality),
    sourceName: raw.source_name,
    sourceUrl: raw.source_url ?? undefined,
    fetchedAt: raw.fetched_at,
    dataVintage: raw.data_vintage,
    h3Cell: raw.h3_cell,
    confidence: raw.confidence as Confidence,
    payload: toAirQualityPayload(raw.payload),
    verdict: {
      headline: raw.verdict.headline,
      eyebrow: raw.verdict.eyebrow,
      bandLabel: raw.verdict.band_label,
      score: raw.verdict.score,
      trendDirection: raw.verdict.trend_direction ?? null,
      caveat: raw.verdict.caveat,
    },
  };
}

function toLocality(raw: Record<string, any>): Locality {
  return {
    slug: raw.slug,
    name: raw.name,
    city: raw.city,
    state: raw.state,
    pincode: raw.pincode ?? undefined,
    h3Cell: raw.h3_cell,
    lat: raw.lat,
    lon: raw.lon,
    categoriesWithData: raw.categories_with_data ?? 0,
  };
}

function toAirQualityPayload(raw: Record<string, any>): AirQualityPayload {
  return {
    currentAqi: raw.current_aqi,
    aqiBand: raw.aqi_band as AqiBand,
    aqiBasis: raw.aqi_basis ?? "24h_rolling",
    latestHourAqi: raw.latest_hour_aqi ?? undefined,
    dominantPollutant: raw.dominant_pollutant ?? undefined,
    pm25: raw.pm2_5 ?? undefined,
    pm10: raw.pm10 ?? undefined,
    no2: raw.no2 ?? undefined,
    so2: raw.so2 ?? undefined,
    co: raw.co ?? undefined,
    o3: raw.o3 ?? undefined,
    nh3: raw.nh3 ?? undefined,
    stationName: raw.station_name ?? undefined,
    nearestStationKm: raw.nearest_station_km ?? undefined,
    observedAt: raw.observed_at ?? undefined,
    trend30d: ((raw.trend_30d ?? []) as Array<Record<string, any>>).map(
      (point): TrendPoint => ({
        day: point.day,
        aqi: point.aqi,
        observationCount: point.observation_count,
      }),
    ),
    sourcesUsed: raw.sources_used ?? [],
  };
}

// ---------------------------------------------------------------------------
// Schools
// ---------------------------------------------------------------------------

export interface SchoolsVerdict {
  headline: string;
  eyebrow: string;
  score: number;
  caveat: string;
  qualityDisclaimer: string;
}

export interface SchoolsView {
  locality: Locality;
  sourceName: string;
  sourceUrl?: string;
  fetchedAt: string;
  dataVintage: string;
  h3Cell: string;
  confidence: Confidence;
  payload: SchoolsAreaPayload;
  verdict: SchoolsVerdict;
}

export async function fetchSchools(slug: string): Promise<SchoolsView> {
  // Schools data changes on the order of years, not hours — an hour of cache is
  // still far fresher than the underlying 2022 survey.
  const response = await fetch(`${API_BASE}/api/v1/localities/${slug}/schools`, {
    next: { revalidate: 3600 },
  });

  if (response.status === 404) {
    const body = await response.json().catch(() => null);
    const detail = body?.detail;
    throw new NoDataError(
      typeof detail === "string"
        ? detail
        : (detail?.reason ?? "No schools data for this locality yet."),
    );
  }
  if (!response.ok) {
    throw new Error(`Failed to load schools (${response.status})`);
  }

  const raw = (await response.json()) as Record<string, any>;
  return {
    locality: toLocality(raw.locality),
    sourceName: raw.source_name,
    sourceUrl: raw.source_url ?? undefined,
    fetchedAt: raw.fetched_at,
    dataVintage: raw.data_vintage,
    h3Cell: raw.h3_cell,
    confidence: raw.confidence as Confidence,
    payload: toSchoolsPayload(raw.payload),
    verdict: {
      headline: raw.verdict.headline,
      eyebrow: raw.verdict.eyebrow,
      score: raw.verdict.score,
      caveat: raw.verdict.caveat,
      qualityDisclaimer: raw.verdict.quality_disclaimer,
    },
  };
}

function toSchoolsPayload(raw: Record<string, any>): SchoolsAreaPayload {
  return {
    schoolsWithin2km: raw.schools_within_2km ?? 0,
    schoolsWithin5km: raw.schools_within_5km ?? 0,
    presenceSource: raw.presence_source ?? undefined,
    schoolsWithStaffingData: raw.schools_with_staffing_data ?? 0,
    medianPupilTeacherRatio: raw.median_pupil_teacher_ratio ?? undefined,
    medianProxyScore: raw.median_proxy_score ?? undefined,
    governmentSharePct: raw.government_share_pct ?? undefined,
    staffingVintage: raw.staffing_vintage ?? undefined,
    boardsAvailable: raw.boards_available ?? [],
    nearestSchools: ((raw.nearest_schools ?? []) as Array<Record<string, any>>).map(
      (s): SchoolsPayload => ({
        name: s.name,
        board: s.board ?? undefined,
        distanceKm: s.distance_km ?? undefined,
        pupilTeacherRatio: s.pupil_teacher_ratio ?? undefined,
        infraScore: s.infra_score ?? undefined,
        passRate: s.pass_rate ?? undefined,
        udiseCode: s.udise_code ?? undefined,
        management: s.management ?? undefined,
        schoolCategory: s.school_category ?? undefined,
        totalStudents: s.total_students ?? undefined,
        totalTeachers: s.total_teachers ?? undefined,
        proxyScore: s.proxy_score ?? undefined,
      }),
    ),
    sourcesUsed: raw.sources_used ?? [],
  };
}

// ---------------------------------------------------------------------------
// The locality report — composite Trust Score, categories, disagreements
// ---------------------------------------------------------------------------

export interface ReportCategory {
  category: string;
  label: string;
  score: number | null;
  confidence: Confidence | null;
  weight: number;
  available: boolean;
  /** Whether this category contributed to the Trust Score. */
  counted: boolean;
  status: string;
  summary: string;
  sourceName?: string;
  dataVintage?: string;
}

export interface Flag {
  category: string;
  /** "serious" | "notable" — how much weight to give it, not a measurement. */
  severity: string;
  headline: string;
  detail: string;
}

export interface Disagreement {
  category: string;
  headline: string;
  detail: string;
  severity: "info" | "notable";
}

export interface TrustScore {
  /** null when too few categories have data to justify one number. */
  score: number | null;
  coveragePct: number;
  categoriesCounted: number;
  categoriesTotal: number;
  reasonUnavailable?: string;
}

export interface LocalityReport {
  locality: Locality;
  trustScore: TrustScore;
  verdict: string;
  biggestWatchout: { category: string; severity: string; headline: string; detail: string } | null;
  flags: Flag[];
  disagreements: Disagreement[];
  categories: ReportCategory[];
  sourcesUsed: string[];
  generatedAt: string;
}

export async function fetchReport(slug: string): Promise<LocalityReport> {
  const response = await fetch(`${API_BASE}/api/v1/localities/${slug}/report`, {
    next: { revalidate: 300 },
  });
  if (!response.ok) {
    throw new Error(`Failed to load report (${response.status})`);
  }
  const raw = (await response.json()) as Record<string, any>;
  return {
    locality: toLocality(raw.locality),
    trustScore: {
      score: raw.trust_score.score ?? null,
      coveragePct: raw.trust_score.coverage_pct,
      categoriesCounted: raw.trust_score.categories_counted,
      categoriesTotal: raw.trust_score.categories_total,
      reasonUnavailable: raw.trust_score.reason_unavailable ?? undefined,
    },
    verdict: raw.verdict,
    biggestWatchout: raw.biggest_watchout ?? null,
    flags: raw.flags ?? [],
    disagreements: raw.disagreements ?? [],
    categories: ((raw.categories ?? []) as Array<Record<string, any>>).map(
      (c): ReportCategory => ({
        category: c.category,
        label: c.label,
        score: c.score ?? null,
        confidence: (c.confidence ?? null) as Confidence | null,
        weight: c.weight,
        available: c.available,
        counted: c.counted,
        status: c.status,
        summary: c.summary ?? "",
        sourceName: c.source_name ?? undefined,
        dataVintage: c.data_vintage ?? undefined,
      }),
    ),
    sourcesUsed: raw.sources_used ?? [],
    generatedAt: raw.generated_at,
  };
}

// ---------------------------------------------------------------------------
// Coverage stats — the home page's credibility numbers
// ---------------------------------------------------------------------------

export interface CoverageStats {
  localities: number;
  cities: number;
  schools: number;
  airReadings: number;
  airSince?: string;
  headlinesScreened: number;
  incidentsConfirmed: number;
  sources: number;
  sourceNames: string[];
  categoriesLive: number;
  lastUpdate?: string;
}

export async function fetchStats(): Promise<CoverageStats> {
  // Ten row counts. Five minutes of cache keeps the home page off the database
  // on every visit without the numbers ever being meaningfully wrong.
  const response = await fetch(`${API_BASE}/api/v1/stats`, {
    next: { revalidate: 300 },
  });
  if (!response.ok) {
    throw new Error(`Failed to load stats (${response.status})`);
  }
  const raw = (await response.json()) as Record<string, any>;
  return {
    localities: raw.localities ?? 0,
    cities: raw.cities ?? 0,
    schools: raw.schools ?? 0,
    airReadings: raw.air_readings ?? 0,
    airSince: raw.air_since ?? undefined,
    headlinesScreened: raw.headlines_screened ?? 0,
    incidentsConfirmed: raw.incidents_confirmed ?? 0,
    sources: raw.sources ?? 0,
    sourceNames: raw.source_names ?? [],
    categoriesLive: raw.categories_live ?? 0,
    lastUpdate: raw.last_update ?? undefined,
  };
}
