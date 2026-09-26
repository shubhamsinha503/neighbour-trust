import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n-server";
import { categoryLabel } from "@/lib/i18n";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ShadowMap } from "@/components/ShadowMap";
import { fetchReport, LocalityNotFoundError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const report = await fetchReport(slug).catch(() => null);
  const name = report?.locality.name ?? "Locality";
  return {
    title: `Sun & shadow · ${name}`,
    description: `How sunlight and shade move across ${name} through the day.`,
  };
}

export default async function SunlightMapPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { t } = await getServerT();

  let report = null;
  try {
    report = await fetchReport(slug);
  } catch (error) {
    if (error instanceof LocalityNotFoundError) notFound();
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href={`/${slug}`}
        className="text-[11px] text-ink-muted underline decoration-dotted underline-offset-2 hover:text-ink-secondary"
      >
        ← {report?.locality.name ?? t("back.report")}
      </Link>

      <h1 className="mt-3 text-[23px] font-bold tracking-[-0.01em]">
        {t("sun.pageTitle")}
      </h1>
      <p className="mt-1.5 mb-5 max-w-xl text-[13px] leading-[1.6] text-ink-secondary">
        {report
          ? t("sun.pageIntro").replace("{name}", report.locality.name)
          : t("sun.pageLoadError")}
      </p>

      {report && (
        <ShadowMap
          name={report.locality.name}
          lat={report.locality.lat}
          lon={report.locality.lon}
        />
      )}
    </main>
  );
}
