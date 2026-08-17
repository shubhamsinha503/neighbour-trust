import Link from "next/link";
import { notFound } from "next/navigation";
import { AirQualityCard } from "@/components/AirQualityCard";
import { fetchAirQuality, fetchLocalities, NoDataError } from "@/lib/api";

export default async function LocalityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const localities = await fetchLocalities().catch(() => []);
  const locality = localities.find((entry) => entry.slug === slug);
  if (localities.length > 0 && !locality) notFound();

  let view = null;
  let unavailable: string | null = null;
  try {
    view = await fetchAirQuality(slug);
  } catch (error) {
    if (error instanceof NoDataError) {
      unavailable = error.reason;
    } else {
      unavailable =
        "Couldn't reach the API. Start it with: uvicorn apps.api.app.main:app --reload";
    }
  }

  const name = view?.locality.name ?? locality?.name ?? slug;
  const city = view?.locality.city ?? locality?.city;
  const state = view?.locality.state ?? locality?.state;
  const pincode = view?.locality.pincode ?? locality?.pincode;

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

      <h2 className="mb-2.5 text-[11.5px] font-bold uppercase tracking-[0.05em] text-ink-secondary">
        Air quality
      </h2>

      {view ? (
        <AirQualityCard view={view} />
      ) : (
        /* "No data" is a first-class answer in this product, not an error state
           to hide — docs/strategy.md is explicit that saying so plainly is the
           difference between a trustworthy product and a hallucinating one. */
        <div className="rounded-[20px] border border-hairline bg-surface-1 p-5">
          <b className="text-[13px]">No air quality data for this locality yet.</b>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-secondary">
            {unavailable}
          </p>
        </div>
      )}

      <p className="mt-6 text-[10.5px] leading-relaxed text-ink-muted">
        Phase 1 covers air quality only. Schools, safety, water, power and
        infrastructure are not yet wired to live sources — see
        docs/build-roadmap.md.
      </p>
    </main>
  );
}
