import NextAuth from "next-auth";

import { authConfigured, authOptions } from "@/lib/auth";

/**
 * Sign-in routes, or a plain 404 while sign-in is not configured.
 *
 * Without credentials next-auth still answered every /api/auth/* request, and
 * in production it fails them with a 500 ("problem with the server
 * configuration") because no NEXTAUTH_SECRET is set. Nothing on the site links
 * there while sign-in is off, but a 500 on a public URL reads as a broken
 * deployment to anyone who probes it, and it is noise in the error logs. Not
 * configured is not an error: the feature simply is not there yet.
 */
const handler = authConfigured ? NextAuth(authOptions) : null;

function notConfigured() {
  return Response.json({ detail: "Sign-in is not enabled." }, { status: 404 });
}

export async function GET(request: Request, context: { params: Promise<{ nextauth: string[] }> }) {
  return handler ? handler(request, context) : notConfigured();
}

export async function POST(request: Request, context: { params: Promise<{ nextauth: string[] }> }) {
  return handler ? handler(request, context) : notConfigured();
}
