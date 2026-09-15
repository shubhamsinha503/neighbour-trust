import { Suspense } from "react";

import { HomeIntro } from "@/components/HomeIntro";
import { LocalitySearch } from "@/components/LocalitySearch";
import { NearMe } from "@/components/NearMe";
import {
  Bone,
  ResultRowSkeleton,
  SkeletonRegion,
  SlowNotice,
} from "@/components/Skeleton";
import { fetchLocalitySummaries, fetchStats } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * The home page streams: the masthead and headline are sent at once, and the
 * locality list and the coverage figures arrive as each is ready.
 *
 * It used to wait for both before sending a byte. The summary behind the list
 * builds 159 reports and is cached for five minutes, so most visits were fast —
 * but a visit that found the cache cold, or the API asleep on its free tier,
 * got a white screen for the whole wait. Now the page is visibly there straight
 * away and the list fills in beneath it.
 */
export default function HomePage() {
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
        * is here rather than a menu of names. But someone who has never heard
        * of this cannot be taught by copy — they can be shown, and the fastest
        * demonstration is the neighbourhood they are standing in. */}
      <div className="mt-5">
        <Suspense fallback={<SearchSkeleton />}>
          <SearchSection />
        </Suspense>
      </div>

      <div className="mt-9 border-t border-hairline pt-7">
        <Suspense fallback={<HomeIntro stats={null} />}>
          <IntroSection />
        </Suspense>
      </div>
    </main>
  );
}

async function SearchSection() {
  try {
    const localities = await fetchLocalitySummaries();
    return (
      <LocalitySearch
        localities={localities}
        belowInput={<NearMe key="near-me" localities={localities} />}
      />
    );
  } catch {
    return (
      <div className="rounded-2xl border border-hairline bg-surface-1 p-4 text-[12px] text-ink-secondary">
        Couldn&apos;t load the localities just now. Please refresh in a moment.
      </div>
    );
  }
}

/** Stats are decoration on top of the list; losing them must not cost the page. */
async function IntroSection() {
  const stats = await fetchStats().catch(() => null);
  return <HomeIntro stats={stats} />;
}

/** The search box, city chips and first results, in their real positions. */
function SearchSkeleton() {
  return (
    <SkeletonRegion label="Loading localities">
      <Bone className="h-[56px] w-full rounded-2xl" />
      <div className="mt-3 flex gap-1.5">
        <Bone className="h-[30px] w-12 rounded-full" />
        <Bone className="h-[30px] w-[88px] rounded-full" />
        <Bone className="h-[30px] w-[84px] rounded-full" />
      </div>
      <Bone className="mt-3 h-3 w-64" />
      <SlowNotice />
      <div className="mt-3 flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <ResultRowSkeleton key={i} />
        ))}
      </div>
    </SkeletonRegion>
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
