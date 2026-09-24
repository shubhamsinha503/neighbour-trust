/**
 * Record that a consented visitor opened a locality's report.
 *
 * Same server-hop shape as /api/prefs: the browser posts only the slug, this
 * server reads the HttpOnly visitor id from the cookie and forwards it to the
 * data API in a header. Two gates, both checked here before anything is sent:
 *
 *   - a visitor id exists (so the banner was accepted at all), and
 *   - the consent cookie is the current grant, the one whose wording names view
 *     history. A yes to the older, preferences-only banner records nothing.
 *
 * Fire-and-forget from the page's point of view: this never fails a render.
 */

import { NextResponse, type NextRequest } from "next/server";

import { CONSENT_COOKIE, CONSENT_GRANTED, VISITOR_COOKIE } from "@/lib/preferences";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export async function POST(request: NextRequest) {
  const id = request.cookies.get(VISITOR_COOKIE)?.value;
  const consent = request.cookies.get(CONSENT_COOKIE)?.value;
  if (!id || consent !== CONSENT_GRANTED) {
    return NextResponse.json({ recorded: false });
  }

  const body = (await request.json().catch(() => ({}))) as { slug?: unknown };
  const slug = typeof body.slug === "string" ? body.slug : "";
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
    return NextResponse.json({ recorded: false }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${API_BASE}/api/v1/prefs/views`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-visitor-id": id },
      body: JSON.stringify({ slug }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const data = await upstream.json().catch(() => ({ recorded: false }));
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json({ recorded: false }, { status: 502 });
  }
}
