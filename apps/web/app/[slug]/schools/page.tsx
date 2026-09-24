import Link from "next/link";
import { getServerT } from "@/lib/i18n-server";
import { categoryLabel } from "@/lib/i18n";
import { SchoolsCard } from "@/components/SchoolsCard";
import { fetchSchools, NoDataError } from "@/lib/api";

export default async function SchoolsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { t } = await getServerT();

  let view = null;
  let unavailable: string | null = null;
  try {
    view = await fetchSchools(slug);
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
        {categoryLabel(t, "schools", "Schools")}{view ? ` — ${view.locality.name}` : ""}
      </h1>

      {view ? (
        <SchoolsCard view={view} />
      ) : (
        <div className="rounded-[20px] border border-hairline bg-surface-1 p-5">
          <b className="text-[13px]">{t("sub.noSchools")}</b>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-secondary">
            {unavailable}
          </p>
        </div>
      )}
    </main>
  );
}
