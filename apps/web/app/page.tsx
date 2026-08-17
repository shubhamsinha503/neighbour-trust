import Link from "next/link";
import { fetchLocalities, type Locality } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let localities: Locality[] = [];
  let error: string | null = null;

  try {
    localities = await fetchLocalities();
  } catch {
    error =
      "Couldn't reach the API. Start it with: uvicorn apps.api.app.main:app --reload";
  }

  const cities = groupByCity(localities);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <MapHero />

      <h1 className="mt-6 text-[23px] font-bold tracking-[-0.01em]">
        Neighbour Trust
      </h1>
      <p className="mt-1 text-[12.5px] text-ink-secondary">
        Sourced, confidence-tagged neighbourhood data. Phase 1: live air quality
        for Bengaluru and Gurugram.
      </p>

      {error && (
        <div className="mt-6 rounded-2xl border border-hairline bg-surface-1 p-4 text-[12px] text-ink-secondary">
          {error}
        </div>
      )}

      {Object.entries(cities).map(([city, entries]) => (
        <section key={city} className="mt-8">
          <h2 className="mb-3 text-[11.5px] font-bold uppercase tracking-[0.05em] text-ink-secondary">
            {city}
          </h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {entries.map((locality) => (
              <Link
                key={locality.slug}
                href={`/${locality.slug}`}
                className="rounded-2xl border border-hairline bg-surface-1 p-3.5 transition-colors hover:border-brand"
              >
                <div className="text-[13px] font-semibold">{locality.name}</div>
                <div className="mt-0.5 text-[11px] text-ink-muted">
                  {locality.pincode ?? locality.state}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

function groupByCity(localities: Locality[]): Record<string, Locality[]> {
  return localities.reduce<Record<string, Locality[]>>((acc, locality) => {
    (acc[locality.city] ??= []).push(locality);
    return acc;
  }, {});
}

/** The map-style hero from the v2 mockup, reduced to its essentials. */
function MapHero() {
  return (
    <div className="relative h-[140px] overflow-hidden rounded-[20px] bg-[linear-gradient(155deg,#0e5a3f_0%,#147a56_45%,#1baf7a_100%)]">
      <svg
        className="absolute inset-0 opacity-35"
        viewBox="0 0 402 140"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <line x1="0" y1="34" x2="402" y2="46" stroke="white" strokeWidth="3" />
        <line x1="0" y1="92" x2="402" y2="79" stroke="white" strokeWidth="3" />
        <line x1="60" y1="0" x2="90" y2="140" stroke="white" strokeWidth="2" />
        <line x1="230" y1="0" x2="200" y2="140" stroke="white" strokeWidth="2" />
        <circle cx="90" cy="40" r="3" fill="white" />
        <circle cx="205" cy="84" r="3" fill="white" />
      </svg>
      <div className="relative flex items-center gap-2 p-4 text-white">
        <div className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-white/20 text-[13px] font-bold">
          N
        </div>
        <div className="text-[14px] font-bold">Neighbour Trust</div>
      </div>
    </div>
  );
}
