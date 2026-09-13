/** Save, re-note or remove one locality on the signed-in person's shortlist. */

import { NextResponse } from "next/server";

import { apiAsUser } from "@/lib/auth";

const SLUG = /^[a-z0-9-]{1,80}$/;

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!SLUG.test(slug)) return NextResponse.json({ detail: "Unknown locality." }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const note = typeof body?.note === "string" ? body.note.slice(0, 2000) : undefined;
  const { status, data } = await apiAsUser(`/api/v1/me/shortlist/${slug}`, {
    method: "PUT",
    body: note === undefined ? {} : { note },
  });
  return NextResponse.json(data, { status });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  if (!SLUG.test(slug)) return NextResponse.json({ detail: "Unknown locality." }, { status: 404 });
  const { status, data } = await apiAsUser(`/api/v1/me/shortlist/${slug}`, { method: "DELETE" });
  return NextResponse.json(data, { status });
}
