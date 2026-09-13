import type { Metadata } from "next";
import Link from "next/link";

import { ShortlistView } from "@/components/ShortlistView";
import { authConfigured } from "@/lib/auth";

export const metadata: Metadata = {
  title: "My shortlist",
  // Private per person; nothing here is worth indexing.
  robots: { index: false, follow: false },
};

export default function ShortlistPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/"
        className="text-[11px] text-ink-muted underline decoration-dotted underline-offset-2 hover:text-ink-secondary"
      >
        ← All localities
      </Link>
      <h1 className="mt-3 text-[23px] font-bold tracking-[-0.01em]">My shortlist</h1>
      {authConfigured ? (
        <ShortlistView />
      ) : (
        <p className="mt-3 text-[13px] text-ink-secondary">Saving localities is not available yet.</p>
      )}
    </main>
  );
}
