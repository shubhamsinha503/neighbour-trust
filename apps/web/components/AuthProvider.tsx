"use client";

import { SessionProvider } from "next-auth/react";

/** Makes the session readable by client components. No-op when auth is off. */
export function AuthProvider({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  if (!enabled) return <>{children}</>;
  return <SessionProvider refetchOnWindowFocus={false}>{children}</SessionProvider>;
}
