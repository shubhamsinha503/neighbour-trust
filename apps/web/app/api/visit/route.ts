/**
 * Count one homepage view.
 *
 * Through the server rather than from the browser, like the question box and
 * locality requests: the API accepts only GETs from browsers, and the
 * per-client rate limit needs the forwarded address, which only a server hop
 * passes along truthfully. Nothing about the visitor is sent — there is no body.
 */

import { NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export async function POST(request: Request) {
  try {
    const upstream = await fetch(`${API_BASE}/api/v1/visits`, {
      method: "POST",
      headers: {
        "x-forwarded-for": request.headers.get("x-forwarded-for") ?? "",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    // A counter must never be load-bearing: if the API is asleep, the badge
    // simply keeps the number it already had.
    return NextResponse.json({ total: null }, { status: 502 });
  }
}
