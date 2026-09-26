/**
 * Two to four localities side by side.
 *
 * Public and linkable, like every report — a comparison gets forwarded to
 * family, and making them sign in to read it would stop exactly that. Built
 * from the same report the locality pages render, so the numbers here cannot
 * disagree with the pages they summarise.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { categoryLabel } from "@/lib/i18n";
import { getServerT } from "@/lib/i18n-server";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export const metadata: Metadata = { title: "Compare localities" };

type Compared = {
  slug: string;
  name: string;
  city: string;
  score: number | null;
  categories_counted: number;
  categories_total: number;
  verdict: string;
  categories: Array<{
    category: string;
    label: string;
    score: number | null;
    available: boolean;
    is_baseline: boolean;
  }>;
  flags: Array<{ headline: string; severity: string }>;
  upcoming: Array<{ headline: string; url?: string }>;
};

function colour(score: number | null): string {
  if (score === null) return "var(--color-ink-muted)";
  return score >= 75 ? "var(--color-brand)" : score >= 55 ? "#c9860a" : "#c0442c";
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ slugs?: string }>;
}) {
  const { slugs = "" } = await searchParams;
  const { t } = await getServerT();
  const clean = slugs
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9-]{1,80}$/.test(s))
    .slice(0, 4);

  let localities: Compared[] = [];
  let error: string | null = null;
  if (clean.length < 2) {
    error = "Choose at least two localities to compare. Tick them on your shortlist.";
  } else {
    try {
      const r = await fetch(`${API_BASE}/api/v1/compare?slugs=${clean.join(",")}`, {
        next: { revalidate: 300 },
      });
      const data = await r.json();
      if (!r.ok) error = data?.detail ?? "Could not load the comparison.";
      else localities = data.localities;
    } catch {
      error = t("compare.unreachable");
    }
  }

  const rows = localities[0]?.categories.map((c) => ({ key: c.category, label: c.label })) ?? [];
  const cell = "border-t border-hairline px-3 py-2.5 align-top";
  const head = "border-t border-hairline py-2.5 pr-3 align-top font-semibold text-ink-primary";

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link
        href="/shortlist"
        className="text-[11px] text-ink-muted underline decoration-dotted underline-offset-2 hover:text-ink-secondary"
      >
        ← {t("back.shortlist")}
      </Link>
      <h1 className="mt-3 text-[23px] font-bold tracking-[-0.01em]">{t("compare.title")}</h1>

      {error ? (
        <p className="mt-4 text-[13px] text-ink-secondary">{error}</p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-0 text-left text-[12.5px]">
            <thead>
              <tr>
                <th className="w-[130px]" />
                {localities.map((l) => (
                  <th key={l.slug} className="px-3 pb-3 align-bottom">
                    <Link href={`/${l.slug}`} className="text-[14px] font-semibold hover:text-brand">
                      {l.name}
                    </Link>
                    <div className="text-[11px] font-normal text-ink-muted">{l.city}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th className={head}>{t("common.trustScore")}</th>
                {localities.map((l) => (
                  <td key={l.slug} className={cell}>
                    <span className="text-[22px] font-bold tabular-nums" style={{ color: colour(l.score) }}>
                      {l.score ?? "—"}
                    </span>
                    <div className="text-[10.5px] text-ink-muted">
                      {t("compare.from")} {l.categories_counted} {t("compare.of")} {l.categories_total} {t("compare.categoriesWord")}
                    </div>
                  </td>
                ))}
              </tr>
              {rows.map(({ key, label }) => (
                <tr key={key}>
                  <th className={head}>{categoryLabel(t, key, label)}</th>
                  {localities.map((l) => {
                    const c = l.categories.find((x) => x.category === key);
                    return (
                      <td key={l.slug} className={cell}>
                        {c?.available && c.score !== null ? (
                          <span
                            className="font-bold tabular-nums"
                            style={{ color: c.is_baseline ? "var(--color-ink-muted)" : colour(c.score) }}
                          >
                            {c.score}
                            {c.is_baseline && (
                              <span className="ml-1 text-[9.5px] font-semibold uppercase">{t("compare.baseline")}</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-ink-muted">{t("common.noDataYet")}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <th className={head}>{t("compare.flags")}</th>
                {localities.map((l) => (
                  <td key={l.slug} className={`${cell} text-[11.5px] text-ink-secondary`}>
                    {l.flags.length ? (
                      <ul className="space-y-1">
                        {l.flags.map((f, i) => (
                          <li key={i}>{f.headline}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-ink-muted">{t("compare.nothingFlagged")}</span>
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <th className={head}>{t("compare.reportedComing")}</th>
                {localities.map((l) => (
                  <td key={l.slug} className={`${cell} text-[11.5px] text-ink-secondary`}>
                    {l.upcoming.length ? (
                      <ul className="space-y-1">
                        {l.upcoming.map((u, i) => (
                          <li key={i}>{u.headline}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-ink-muted">{t("compare.nothingReported")}</span>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
