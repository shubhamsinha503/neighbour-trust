"use client";

/**
 * The strip at the top of every page: sign in, or your shortlist.
 *
 * Deliberately small. Signing in is optional and nothing on the site needs it —
 * every report, the search and the question box work for anyone — so the bar
 * offers it rather than asks for it.
 */

import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";

export function AccountBar() {
  const { data: session, status } = useSession();

  return (
    <div className="mx-auto flex max-w-3xl items-center justify-end gap-3 px-4 pt-3 text-[12px]">
      {status === "loading" ? (
        <span className="h-[26px]" aria-hidden="true" />
      ) : session ? (
        <>
          <Link href="/shortlist" className="font-semibold text-brand hover:underline">
            ♥ My shortlist
          </Link>
          <span className="hidden text-ink-muted sm:inline">
            {session.user?.name ?? session.user?.email}
          </span>
          <button type="button" onClick={() => signOut()} className="text-ink-muted hover:text-ink-secondary">
            Sign out
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => signIn("google")}
          className="rounded-full border border-hairline bg-surface-1 px-3 py-1 font-semibold text-ink-secondary hover:border-brand hover:text-brand"
        >
          Sign in to save localities
        </button>
      )}
    </div>
  );
}
