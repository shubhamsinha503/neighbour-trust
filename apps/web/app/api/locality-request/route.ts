/**
 * Relay a "please cover this place" request to the API.
 *
 * Through the server rather than from the browser, like the question box: the
 * API accepts only GETs from browsers, and the per-visitor rate limit needs the
 * forwarded address, which only a server hop passes along truthfully. Nothing
 * identifying is forwarded in the body.
 */

import { NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function str(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const query = str(body?.query, 120);
  if (!query || query.length < 2) {
    return NextResponse.json({ detail: "Tell us the name of the place." }, { status: 400 });
  }

  const payload = {
    query,
    city: str(body?.city, 40),
    place_label: str(body?.placeLabel, 200),
    lat: num(body?.lat),
    lon: num(body?.lon),
    nearest_slug: str(body?.nearestSlug, 80),
    nearest_km: num(body?.nearestKm),
  };

  try {
    const upstream = await fetch(`${API_BASE}/api/v1/locality-requests`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ detail: "Couldn't send that just now. Please try again." }, { status: 502 });
  }
}
