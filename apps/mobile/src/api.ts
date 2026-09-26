/**
 * API client for the native app.
 *
 * Talks to the SAME FastAPI backend the website uses — nothing here is
 * duplicated logic, just typed fetches. The base URL comes from
 * EXPO_PUBLIC_API_BASE_URL so a device on your LAN can reach the dev API
 * (e.g. http://192.168.1.5:8000). It defaults to localhost for the web preview.
 *
 * On a phone, "localhost" is the phone itself, so you MUST set
 * EXPO_PUBLIC_API_BASE_URL to your computer's LAN IP when running in Expo Go.
 */

// Default to the hosted production API so the app works on any phone out of the
// box (no env setup on device). Point EXPO_PUBLIC_API_BASE_URL at a LAN dev
// server when working against a local backend.
const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://neighbour-trust.onrender.com";

export interface LocalitySummary {
  slug: string;
  name: string;
  city: string;
  state: string;
  pincode: string | null;
  score: number | null;
  categories_with_data: number;
}

export interface ReportCategory {
  category: string;
  label: string;
  score: number | null;
  confidence: string | null;
  available: boolean;
  counted: boolean;
  is_baseline: boolean;
  status: string;
  summary: string;
}

export interface Flag {
  category: string;
  /** "serious" | "notable" — how much weight to give it, not a measurement. */
  severity: string;
  headline: string;
  detail: string;
}

export interface Report {
  locality: {
    slug: string;
    name: string;
    city: string;
    state: string;
    pincode: string | null;
    lat: number;
    lon: number;
  };
  trust_score: {
    score: number | null;
    categories_counted: number;
    categories_total: number;
  };
  verdict: string;
  flags: Flag[];
  categories: ReportCategory[];
  sources_used: string[];
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return (await res.json()) as T;
}

export function fetchSummaries(): Promise<LocalitySummary[]> {
  return getJson<LocalitySummary[]>("/api/v1/localities/summary");
}

export function fetchReport(slug: string): Promise<Report> {
  return getJson<Report>(`/api/v1/localities/${slug}/report`);
}

export { API_BASE };

// ---------------------------------------------------------------------------
// Category detail endpoints
//
// Each returns the full envelope when data exists, or 404 with a { detail:
// { reason } } body when it does not — "no data" is a real answer here, so it is
// surfaced as NoDataError rather than a failure.
// ---------------------------------------------------------------------------

export class NoDataError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "NoDataError";
  }
}

async function getDetail<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (res.status === 404) {
    const body = await res.json().catch(() => null);
    const detail = (body as { detail?: unknown } | null)?.detail;
    const reason =
      typeof detail === "string"
        ? detail
        : ((detail as { reason?: string } | undefined)?.reason ??
          "No data for this locality yet.");
    throw new NoDataError(reason);
  }
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return (await res.json()) as T;
}

export interface AirQualityDetail {
  confidence: string;
  source_name: string;
  data_vintage: string;
  historical?: boolean;
  verdict: { headline: string; eyebrow: string; band_label: string; caveat?: string };
  payload: {
    current_aqi: number;
    aqi_band: string;
    latest_hour_aqi?: number;
    dominant_pollutant?: string;
    pm2_5?: number;
    pm10?: number;
    no2?: number;
    o3?: number;
    station_name?: string;
    nearest_station_km?: number;
    observed_at?: string;
  };
}

export interface SchoolsDetail {
  confidence: string;
  source_name: string;
  data_vintage: string;
  verdict: { headline: string; eyebrow: string; caveat?: string; quality_disclaimer?: string };
  payload: {
    schools_within_2km: number;
    schools_within_5km: number;
    schools_with_staffing_data: number;
    median_pupil_teacher_ratio?: number;
    staffing_vintage?: string;
    nearest_schools?: Array<{ name: string; board?: string; distance_km?: number }>;
  };
}

export interface ConnectivityDetail {
  confidence: string;
  source_name: string;
  payload: {
    summary?: string;
    scope_note?: string;
    connectivity_score?: number;
    metro_rail_stations?: number;
    hospitals?: number;
    clinics?: number;
    parks?: number;
    markets?: number;
    industrial_sites?: number;
    nearest_station_km?: number;
    nearest_hospital_km?: number;
    nearest_park_km?: number;
  };
}

export const fetchAirQuality = (slug: string) =>
  getDetail<AirQualityDetail>(`/api/v1/localities/${slug}/air-quality`);
export const fetchSchools = (slug: string) =>
  getDetail<SchoolsDetail>(`/api/v1/localities/${slug}/schools`);
export const fetchConnectivity = (slug: string) =>
  getDetail<ConnectivityDetail>(`/api/v1/localities/${slug}/connectivity`);
