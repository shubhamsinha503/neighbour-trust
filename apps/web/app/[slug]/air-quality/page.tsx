import Link from "next/link";
import { getServerT } from "@/lib/i18n-server";
import { categoryLabel } from "@/lib/i18n";
import { AirQualityCard } from "@/components/AirQualityCard";
import { fetchAirQuality, NoDataError } from "@/lib/api";

export default async function AirQualityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { t } = await getServerT();

  let view = null;
  let unavailable: string | null = null;
  try {
    view = await fetchAirQuality(slug);
  } catch (error) {
    unavailable =
      error instanceof NoDataError
        ? error.reason
        : t("sub.loadError");
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href={`/${slug}`}
        className="text-[11px] text-ink-muted underline decoration-dotted underline-offset-2 hover:text-ink-secondary"
      >
        ← {t("back.report")}
      </Link>

      <h1 className="mb-5 mt-3 text-[23px] font-bold tracking-[-0.01em]">
        {categoryLabel(t, "air_quality", "Air quality")}{view ? ` — ${view.locality.name}` : ""}
      </h1>

      {view ? (
        <AirQualityCard view={view} />
      ) : (
        /* "No data" is a first-class answer here, not an error state. */
        <div className="rounded-[20px] border border-hairline bg-surface-1 p-5">
          <b className="text-[13px]">{t("sub.noAir")}</b>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-secondary">
            {unavailable}
          </p>
        </div>
      )}
    </main>
  );
}
