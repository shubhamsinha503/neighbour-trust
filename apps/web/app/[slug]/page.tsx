import Link from "next/link";
import { notFound } from "next/navigation";
import { TrustReport } from "@/components/TrustReport";
import { fetchLocalities, fetchReport } from "@/lib/api";

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
