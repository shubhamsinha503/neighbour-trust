import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { categoryLabel } from "@/lib/i18n";
import { getServerT } from "@/lib/i18n-server";
import type { ReportCategory } from "@/lib/api";

/**
 * The horizontal "Category scores" strip, mirroring the native report screen
 * (apps/mobile/app/[slug]/index). One compact card per scored category — a
 * soft-tinted glyph, the label, the score in its band colour, and a plain band
 * word. Air quality / schools / connectivity link to their detail page. The band
 * word only restates the score; it never adds a claim, and schools reads as a
 * count of what's nearby, not a quality rating.
 */

const CAT_COLOR: Record<string, string> = {
  schools: "#2563EB",
  crime: "#F72575",
  safety: "#F72575",
  air_quality: "#1B9362",
  water: "#06B6D4",
  infrastructure: "#7C3AED",
};

const CAT_ICON: Record<string, IconName> = {
  schools: "book",
  crime: "shield",
  safety: "shield",
  air_quality: "leaf",
  water: "drop",
  infrastructure: "bus",
};

const DETAIL_PATH: Record<string, string> = {
  air_quality: "air-quality",
  schools: "schools",
  infrastructure: "connectivity",
};

const SCORE_BANDS: Array<[number, string]> = [
  [75, "var(--color-status-good)"],
  [55, "var(--color-status-warning)"],
  [40, "var(--color-status-serious)"],
  [0, "var(--color-status-critical)"],
];
function scoreColor(score: number | null): string {
  if (score === null) return "var(--color-ink-muted)";
  return SCORE_BANDS.find(([floor]) => score >= floor)?.[1] ?? SCORE_BANDS[0][1];
}

function bandWord(category: string, score: number | null): string {
  if (score === null) return "Not scored";
  if (category === "schools") {
    if (score >= 60) return "Plenty nearby";
    if (score >= 30) return "Some nearby";
    return "Few nearby";
  }
  if (score >= 80) return "Highly rated";
  if (score >= 70) return "Good";
  if (score >= 60) return "Fair";
  return "Mixed";
}

export async function CategoryStrip({
  categories,
  slug,
}: {
  categories: ReportCategory[];
  slug: string;
}) {
  const { t } = await getServerT();
  const available = categories.filter((c) => c.available);
  if (available.length === 0) return null;

  return (
    <section className="mt-6">
      <h3 className="mb-3 text-[18px] font-bold tracking-[-0.01em] text-ink-primary">
        Category scores
      </h3>
      <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {available.map((c) => {
          const color = CAT_COLOR[c.category] ?? "var(--color-brand)";
          const icon = CAT_ICON[c.category] ?? "shield";
          const detail = DETAIL_PATH[c.category];
          const inner = (
            <div className="flex w-[104px] shrink-0 flex-col items-center gap-0.5 rounded-2xl border border-hairline bg-surface-1 px-2 py-3 text-center">
              <span
                className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: color + "1A" }}
              >
                <Icon name={icon} size={18} color={color} />
              </span>
              <span className="truncate text-[11.5px] font-semibold text-ink-secondary">
                {categoryLabel(t, c.category, c.label)}
              </span>
              <span
                className="text-[22px] font-extrabold leading-none"
                style={{ color: scoreColor(c.score) }}
              >
                {c.score ?? "—"}
              </span>
              <span className="text-[9.5px] text-ink-muted">{bandWord(c.category, c.score)}</span>
            </div>
          );
          return detail ? (
            <Link
              key={c.category}
              href={`/${slug}/${detail}`}
              className="transition-shadow hover:shadow-[0_6px_18px_rgba(16,33,58,0.08)]"
            >
              {inner}
            </Link>
          ) : (
            <div key={c.category}>{inner}</div>
          );
        })}
      </div>
    </section>
  );
}
