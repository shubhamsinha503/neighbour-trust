/**
 * Google sign-in, and the only place a session becomes an API credential.
 *
 * Sessions are JWT cookies issued by next-auth, with no database adapter: the
 * account itself lives in the API's Postgres (infra/migrations/009), created
 * the first time a signed-in person is seen there. That keeps one store of
 * personal data rather than two.
 *
 * Nothing here runs unless GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and
 * NEXTAUTH_SECRET are set; `authConfigured` lets the UI hide sign-in entirely
 * rather than show a button that fails.
 */

import { createHmac } from "node:crypto";

import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authConfigured = Boolean(
  process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.NEXTAUTH_SECRET &&
    process.env.USER_TOKEN_SECRET,
);

export const authOptions: NextAuthOptions = {
  providers: authConfigured
    ? [
        GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          // Only the basic profile: name and email to show who is signed in.
          authorization: { params: { scope: "openid email profile" } },
        }),
      ]
    : [],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, profile }) {
      // Google's `sub` is the stable account id; next-auth already puts it in
      // token.sub without an adapter, and the profile image is dropped because
      // nothing here needs it.
      if (profile && "sub" in profile && profile.sub) token.sub = String(profile.sub);
      delete (token as Record<string, unknown>).picture;
      return token;
    },
    async session({ session, token }) {
      // Read on the server only (apiAsUser). The browser's copy of the session
      // carries the same id, which is harmless: it identifies the account to
      // nobody but Google and this app.
      if (session.user) {
        (session.user as { sub?: string }).sub = token.sub;
        delete (session.user as Record<string, unknown>).image;
      }
      return session;
    },
  },
};

export async function currentSession() {
  if (!authConfigured) return null;
  return getServerSession(authOptions);
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const TOKEN_AUDIENCE = "neighbour-trust-api";

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * A two-minute HS256 token naming the signed-in person, for one call to the API.
 * Signed with USER_TOKEN_SECRET, which only this server and the API hold.
 */
export function mintUserToken(user: { sub: string; email?: string | null; name?: string | null }): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub: user.sub,
      email: user.email ?? null,
      name: user.name ?? null,
      aud: TOKEN_AUDIENCE,
      iat: now,
      exp: now + 120,
    }),
  );
  const signature = createHmac("sha256", process.env.USER_TOKEN_SECRET ?? "")
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

/**
 * Call the API as the signed-in person. Returns a Response-like result the
 * route handlers pass straight back; 401 when nobody is signed in.
 */
export async function apiAsUser(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; data: unknown }> {
  const session = await currentSession();
  const sub = (session?.user as { sub?: string } | undefined)?.sub;
  if (!session || !sub) return { status: 401, data: { detail: "Sign in first." } };

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${mintUserToken({ sub, email: session.user?.email, name: session.user?.name })}`,
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    const data = await response.json().catch(() => ({}));
    return { status: response.status, data };
  } catch {
    return { status: 502, data: { detail: "Could not reach the server. Try again." } };
  }
}
