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
