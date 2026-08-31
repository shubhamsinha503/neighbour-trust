import Link from "next/link";
import { notFound } from "next/navigation";
import { AirQualityCard } from "@/components/AirQualityCard";
import { SchoolsCard } from "@/components/SchoolsCard";
import {
  fetchAirQuality,
  fetchLocalities,
  fetchSchools,
  NoDataError,
} from "@/lib/api";

const API_DOWN =
  "Couldn't reach the API. Start it with: uvicorn apps.api.app.main:app --reload";

export default async function LocalityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const localities = await fetchLocalities().catch(() => []);
  const locality = localities.find((entry) => entry.slug === slug);
  if (localities.length > 0 && !locality) notFound();

  // Both categories are fetched together; neither blocks the other, so a
  // category with no data still renders its own honest empty state rather than
  // taking the page down.
  const [air, schools] = await Promise.all([
    fetchAirQuality(slug).then(asLoaded).catch(toUnavailable),
    fetchSchools(slug).then(asLoaded).catch(toUnavailable),
  ]);

  const name = air.view?.locality.name ?? schools.view?.locality.name ?? locality?.name ?? slug;
  const city = air.view?.locality.city ?? schools.view?.locality.city ?? locality?.city;
  const state = air.view?.locality.state ?? schools.view?.locality.state ?? locality?.state;
  const pincode =
    air.view?.locality.pincode ?? schools.view?.locality.pincode ?? locality?.pincode;

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

      <SectionTitle>Air quality</SectionTitle>
      {air.view ? (
        <AirQualityCard view={air.view} />
      ) : (
        <NoData
          title="No air quality data for this locality yet."
          reason={air.reason}
        />
      )}

      <div className="mt-8" />
      <SectionTitle>Schools</SectionTitle>
      {schools.view ? (
        <SchoolsCard view={schools.view} />
      ) : (
        <NoData
          title="No schools data for this locality yet."
          reason={schools.reason}
        />
      )}

      <p className="mt-6 text-[10.5px] leading-relaxed text-ink-muted">
        Phase 2 in progress: air quality and schools are live. Safety, water,
        power and infrastructure are not yet wired to sources — see
        docs/build-roadmap.md.
      </p>
    </main>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2.5 text-[11.5px] font-bold uppercase tracking-[0.05em] text-ink-secondary">
      {children}
    </h2>
  );
}

/**
 * "No data" is a first-class answer in this product, not an error state to hide
 * — docs/strategy.md is explicit that saying so plainly is the difference
 * between a trustworthy product and a hallucinating one. For schools it is
 * load-bearing: a locality can be withheld because coverage was measured to be
 * unreliable there, and that reason is worth reading.
 */
function NoData({ title, reason }: { title: string; reason?: string }) {
  return (
    <div className="rounded-[20px] border border-hairline bg-surface-1 p-5">
      <b className="text-[13px]">{title}</b>
      {reason && (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-secondary">
          {reason}
        </p>
      )}
    </div>
  );
}

function asLoaded<T>(view: T): { view: T; reason?: string } {
  return { view };
}

function toUnavailable(error: unknown): { view: null; reason: string } {
  return {
    view: null,
    reason: error instanceof NoDataError ? error.reason : API_DOWN,
  };
}
