import { NextResponse } from "next/server";

import { apiAsUser } from "@/lib/auth";

export async function GET() {
  const { status, data } = await apiAsUser("/api/v1/me/shortlist");
  return NextResponse.json(data, { status });
}
