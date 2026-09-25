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

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

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

export interface Report {
  locality: {
    slug: string;
    name: string;
    city: string;
    state: string;
    pincode: string | null;
  };
  trust_score: {
    score: number | null;
    categories_counted: number;
    categories_total: number;
  };
  verdict: string;
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
