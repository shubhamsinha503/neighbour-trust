/**
 * The personalisation consent gate.
 *
 * Storing preferences against a per-person id is the one thing on this site that
 * needs asking first (DPDP, and the promise the privacy page makes). This route
 * is where the asking is recorded:
 *
 *   POST   { grant: boolean }  — the banner's answer. On grant we mint an opaque
 *                                visitor id and set it HttpOnly, plus a readable
 *                                nt_consent=granted so the banner never asks
 *                                again. On decline we set nt_consent=denied and
 *                                make sure no id exists.
 *   DELETE                     — withdraw and forget: erase the server row for
 *                                this visitor, drop the id, record denial.
 *
 * The id is set HttpOnly on purpose: the browser sends it to our server on every
 * request (so we can read a preference), but page scripts — and anything that
 * gets injected into them — can never read it. It never appears in a URL.
 */

import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { CONSENT_COOKIE, VISITOR_COOKIE } from "@/lib/preferences";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const SECURE = process.env.NODE_ENV === "production";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { grant?: boolean };
  const grant = body.grant === true;

  const res = NextResponse.json({ consent: grant ? "granted" : "denied" });

  if (grant) {
    // Reuse an id the visitor already carries rather than minting a second one,
    // so re-granting does not strand their existing row.
    const existing = request.cookies.get(VISITOR_COOKIE)?.value;
    const id = existing && UUID_RE.test(existing) ? existing : randomUUID();
    res.cookies.set(VISITOR_COOKIE, id, {
      httpOnly: true,
      sameSite: "lax",
      secure: SECURE,
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
    });
    res.cookies.set(CONSENT_COOKIE, "granted", {
      httpOnly: false,
      sameSite: "lax",
      secure: SECURE,
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
    });
  } else {
    res.cookies.set(CONSENT_COOKIE, "denied", {
      httpOnly: false,
      sameSite: "lax",
      secure: SECURE,
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
    });
    // Declining must not leave an id behind that a later grant would revive.
    res.cookies.delete(VISITOR_COOKIE);
  }

  return res;
}

export async function DELETE(request: NextRequest) {
  const id = request.cookies.get(VISITOR_COOKIE)?.value;

  // Erase the row first, then drop the cookie. If the API is unreachable we
  // still clear the cookie so the visitor is at least de-linked on this device,
  // and the orphaned row holds nothing but a city name against a random id.
  if (id && UUID_RE.test(id)) {
    await fetch(`${API_BASE}/api/v1/prefs`, {
      method: "DELETE",
      headers: { "x-visitor-id": id },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {});
  }

  const res = NextResponse.json({ forgotten: true });
  res.cookies.delete(VISITOR_COOKIE);
  // Treat forgetting as withdrawing consent — do not nag with the banner again.
  res.cookies.set(CONSENT_COOKIE, "denied", {
    httpOnly: false,
    sameSite: "lax",
    secure: SECURE,
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
  return res;
}
