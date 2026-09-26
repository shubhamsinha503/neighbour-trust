import type { Metadata } from "next";
import Link from "next/link";

import { ShortlistView } from "@/components/ShortlistView";
import { authConfigured } from "@/lib/auth";
import { getServerT } from "@/lib/i18n-server";

export const metadata: Metadata = {
  title: "My shortlist",
  // Private per person; nothing here is worth indexing.
  robots: { index: false, follow: false },
};

export default async function ShortlistPage() {
  const { t } = await getServerT();
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/"
        className="text-[11px] text-ink-muted underline decoration-dotted underline-offset-2 hover:text-ink-secondary"
      >
        ← {t("back.allLocalities")}
      </Link>
      <h1 className="mt-3 text-[23px] font-bold tracking-[-0.01em]">{t("shortlist.title")}</h1>
      {authConfigured ? (
        <ShortlistView />
      ) : (
        <p className="mt-3 text-[13px] text-ink-secondary">{t("shortlist.unavailable")}</p>
      )}
    </main>
  );
}
