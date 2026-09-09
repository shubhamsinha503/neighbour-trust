import { HomeIntro } from "@/components/HomeIntro";
import { LocalitySearch } from "@/components/LocalitySearch";
import { NearMe } from "@/components/NearMe";
import {
  fetchLocalitySummaries,
  fetchStats,
  type CoverageStats,
  type LocalitySummary,
} from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let localities: LocalitySummary[] = [];
  let stats: CoverageStats | null = null;
  let error: string | null = null;

  // Fetched together — the page needs both and they are independent.
  const [localityResult, statsResult] = await Promise.allSettled([
    fetchLocalitySummaries(),
    fetchStats(),
  ]);

  if (localityResult.status === "fulfilled") {
    localities = localityResult.value;
  } else {
    error =
      "Couldn't reach the API. Start it with: uvicorn apps.api.app.main:app --reload";
  }

  // Stats are decoration on top of the list; losing them must not cost the page.
  // HomeIntro renders without them.
  if (statsResult.status === "fulfilled") {
    stats = statsResult.value;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <MapHero />

      <h1 className="mt-6 text-[26px] font-bold leading-[1.2] tracking-[-0.02em]">
        Know the neighbourhood
        <br />
        before you commit to it.
      </h1>

      {/* Two ways in, in the order people arrive.
        *
        * Most visitors come with an area already in mind, which is why search
        * is here rather than a menu of forty-four names. But someone who has
        * never heard of this cannot be taught by copy — they can be shown, and
        * the fastest demonstration is the neighbourhood they are standing in.
        * Declining is itself informative: it means they came with something in
        * mind, and search is right underneath either way. */}
      <div className="mt-5">
        {error ? (
          <div className="rounded-2xl border border-hairline bg-surface-1 p-4 text-[12px] text-ink-secondary">
            {error}
          </div>
        ) : (
          <LocalitySearch
            localities={localities}
            belowInput={<NearMe key="near-me" localities={localities} />}
          />
        )}
      </div>

      <div className="mt-9 border-t border-hairline pt-7">
        <HomeIntro stats={stats} />
      </div>

    </main>
  );
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
