/**
 * Relay a question to the API's Q&A endpoint.
 *
 * A server route rather than a browser fetch for two reasons. The API allows
 * browsers GET only, and opening it to cross-origin POSTs would widen what any
 * page on the internet can make it do — for the one endpoint that spends money
 * per request. And the API rate-limits per visitor on the forwarded address,
 * which only a server hop can pass along truthfully.
 */

import { NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
    return NextResponse.json({ detail: "Unknown locality." }, { status: 404 });
  }

  let question = "";
  try {
    const body = await request.json();
    question = typeof body?.question === "string" ? body.question.trim() : "";
  } catch {
    return NextResponse.json({ detail: "Send a question." }, { status: 400 });
  }
  if (question.length < 3) {
    return NextResponse.json({ detail: "Ask a slightly longer question." }, { status: 400 });
  }

  const forwarded =
    request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "";

  try {
    const upstream = await fetch(`${API_BASE}/api/v1/localities/${slug}/ask`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": forwarded },
      body: JSON.stringify({ question: question.slice(0, 400) }),
      cache: "no-store",
      // The API sleeps when idle on its current plan; a cold start plus a
      // model call can take a while, and a spinner is better than a failure.
      signal: AbortSignal.timeout(60_000),
    });
    const data = await upstream.json().catch(() => ({ detail: "Bad response." }));
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    return NextResponse.json(
      { detail: "Could not reach the answering service. Please try again." },
      { status: 502 },
    );
  }
}
