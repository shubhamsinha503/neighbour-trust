import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrustReport } from "@/components/TrustReport";
import { fetchLocalities, fetchReport } from "@/lib/api";

const SITE_DESCRIPTION =
  "Sourced, confidence-tagged neighbourhood data for Bengaluru and Gurugram.";

/**
 * Per-locality title and description.
 *
 * Every locality page previously served the site's default title, so Google saw
 * forty-four near-identical pages and a shared link showed "Neighbour Trust"
 * whatever it pointed at. Search and sharing are this product's two free
 * channels and both were broken by the same omission.
 *
 * The description is built from the report rather than a template, so what a
 * search result or a WhatsApp preview says is the same claim the page makes —
 * including when that claim is "we do not have enough to score this".
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  const report = await fetchReport(slug).catch(() => null);
  if (!report) {
    return { title: "Locality", description: SITE_DESCRIPTION };
  }

  const { name, city } = report.locality;
  const title = `${name}, ${city}`;

  // Lead with the flag if there is one: it is the most decision-relevant thing
  // we know, and a preview that opens with a real finding is worth more than one
  // that opens with a score.
  const lead =
    report.flags[0]?.headline ??
    (report.trustScore.score !== null
      ? `Trust Score ${report.trustScore.score} of 100`
      : "Not enough data yet for an overall score");

  const categories = report.categories
    .filter((c) => c.available)
    .map((c) => c.label.toLowerCase())
    .join(", ");

  const description =
    `${lead}. ${name} in ${city} — ${categories || "coverage"} data with ` +
    `sources and dates attached. Every figure says how old it is and how much ` +
    `to trust it.`;

  return {
    title,
    description,
    alternates: { canonical: `/${slug}` },
    openGraph: { title: `${title} · Neighbour Trust`, description, type: "article" },
    twitter: { card: "summary_large_image", title: `${title} · Neighbour Trust`, description },
  };
}


export default async function LocalityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const localities = await fetchLocalities().catch(() => []);
  const locality = localities.find((entry) => entry.slug === slug);
  if (localities.length > 0 && !locality) notFound();

  let report = null;
  let error: string | null = null;
  try {
    report = await fetchReport(slug);
  } catch {
    error =
      "Couldn't reach the API. Start it with: uvicorn apps.api.app.main:app --reload";
  }

  const name = report?.locality.name ?? locality?.name ?? slug;
  const city = report?.locality.city ?? locality?.city;
  const state = report?.locality.state ?? locality?.state;
  const pincode = report?.locality.pincode ?? locality?.pincode;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/"
        className="text-[11px] text-ink-muted underline decoration-dotted underline-offset-2 hover:text-ink-secondary"
      >
        ← All localities
      </Link>

      <header className="mb-5 mt-3">
        <h1 className="text-[23px] font-bold tracking-[-0.01em]">{name}</h1>
        {city && (
          <div className="mt-0.5 text-[12.5px] text-ink-secondary">
            {city}, {state}
            {pincode ? ` · ${pincode}` : ""}
          </div>
        )}
      </header>

      {report ? (
        <TrustReport report={report} />
      ) : (
        <div className="rounded-[20px] border border-hairline bg-surface-1 p-5">
          <b className="text-[13px]">Report unavailable</b>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-secondary">
            {error}
          </p>
        </div>
      )}

      <p className="mt-8 text-[10.5px] leading-relaxed text-ink-muted">
        Neighbour Trust is in early access. Air quality and schools are wired to
        live sources; safety and water carry press coverage only; power and
        infrastructure have no source yet. See docs/build-roadmap.md.
      </p>
    </main>
  );
}
