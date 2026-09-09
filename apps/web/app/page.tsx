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
      <Masthead />

      <h1 className="mt-5 text-[26px] font-bold leading-[1.2] tracking-[-0.02em]">
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
/**
 * The masthead, reduced to a masthead.
 *
 * This was a 140-pixel gradient panel with decorative map lines drawn across
 * it, and the only thing in it was the logo. On a phone that is a quarter of
 * the first screen spent on nothing — and once the city filter, the location
 * button and the note explaining the score were added, a reader had to scroll
 * past two full screens before reaching a single locality.
 *
 * Everything above the first result is a toll charged on someone who has not
 * yet been shown anything worth paying it for. The brand still identifies the
 * page; it just no longer costs a screen to do it.
 */
function Masthead() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-brand text-[13px] font-bold text-white">
        N
      </div>
      <div className="text-[14px] font-bold tracking-[-0.01em]">
        Neighbour Trust
      </div>
    </div>
  );
}
