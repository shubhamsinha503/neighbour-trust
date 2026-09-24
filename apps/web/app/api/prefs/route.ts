/**
 * Save a consented visitor's preference server-side.
 *
 * The browser calls this (from lib/preferences.ts `saveCityPreference`); this
 * server reads the HttpOnly visitor id from the cookie and forwards the write to
 * the data API with the id in a header, never the URL. The browser cannot reach
 * the data API directly — its CORS allows only GET — so this hop is the only way
 * a preference is written, and it happens only when a visitor id exists, which
 * means only after consent.
 *
 * Reads are not here: the home page reads the preference during its own server
 * render (see app/page.tsx), which already holds the cookie.
 */

import { NextResponse, type NextRequest } from "next/server";

import { VISITOR_COOKIE } from "@/lib/preferences";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export async function PUT(request: NextRequest) {
  const id = request.cookies.get(VISITOR_COOKIE)?.value;
  // No id means no consent — silently do nothing rather than storing anything.
  if (!id) return NextResponse.json({ city: null });

  const body = (await request.json().catch(() => ({}))) as { city?: string | null };

  try {
    const upstream = await fetch(`${API_BASE}/api/v1/prefs`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-visitor-id": id },
      body: JSON.stringify({ city: body.city ?? null }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const data = await upstream.json().catch(() => ({ city: null }));
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    // A preference save is never load-bearing.
    return NextResponse.json({ city: null }, { status: 502 });
  }
}
