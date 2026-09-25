import type { Metadata } from "next";
import Link from "next/link";

import { LocalitySearch } from "@/components/LocalitySearch";
import { fetchLocalitySummaries } from "@/lib/api";
import { getServerT } from "@/lib/i18n-server";
import { readSavedCity } from "@/lib/serverPrefs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "All localities",
  description:
    "Every locality Neighbour Trust covers in Bengaluru, Gurugram, Hyderabad and Mumbai, with its Trust Score and anything flagged.",
};

/**
 * The full directory, moved off the front page.
 *
 * The front page is a search; this is for someone who wants to scan what is
 * covered, and it keeps every locality one link from the home page for search
 * engines. It is the same component with the list switched on, so filtering,
 * ordering and the result rows cannot drift from the search.
 */
export default async function LocalitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string }>;
}) {
  const { city } = await searchParams;
  const { t } = await getServerT();
  let localities = null;
  try {
    localities = await fetchLocalitySummaries();
  } catch {
    localities = null;
  }

  // An explicit ?city= in the URL wins (a shared or bookmarked link means
  // exactly that city); otherwise open on the city the visitor last chose, so
  // the list they scan is the one they care about. Only ever a city we carry.
  let initialCity: string | null = null;
  if (localities) {
    const known = new Set(localities.map((l) => l.city));
    initialCity = city && known.has(city) ? city : await readSavedCity(known);
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/"
        className="text-[11px] text-ink-muted underline decoration-dotted underline-offset-2 hover:text-ink-secondary"
      >
        ← {t("back.search")}
      </Link>
      <h1 className="mt-3 text-[23px] font-bold tracking-[-0.01em]">{t("localities.title")}</h1>
      <p className="mt-1 text-[13px] text-ink-secondary">
        {t("localities.subtitle")}
      </p>

      <div className="mt-5">
        {localities ? (
          <LocalitySearch localities={localities} initialCity={initialCity} />
        ) : (
          <div className="rounded-2xl border border-hairline bg-surface-1 p-4 text-[12.5px] text-ink-secondary">
            {t("home.loadError")}
          </div>
        )}
      </div>
    </main>
  );
}
