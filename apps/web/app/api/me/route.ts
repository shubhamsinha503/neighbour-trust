/** The signed-in person, or erase their account. Relayed to the API as them. */

import { NextResponse } from "next/server";

import { apiAsUser } from "@/lib/auth";

export async function GET() {
  const { status, data } = await apiAsUser("/api/v1/me");
  return NextResponse.json(data, { status });
}

export async function DELETE() {
  const { status, data } = await apiAsUser("/api/v1/me", { method: "DELETE" });
  return NextResponse.json(data, { status });
}
