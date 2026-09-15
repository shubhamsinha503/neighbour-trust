import Link from "next/link";
import { Suspense } from "react";

import { HomeIntro } from "@/components/HomeIntro";
import { LocalitySearch } from "@/components/LocalitySearch";
import { NearMe } from "@/components/NearMe";
import { ShortlistShortcut } from "@/components/ShortlistShortcut";
import { Bone, SkeletonRegion, SlowNotice } from "@/components/Skeleton";
import { authConfigured } from "@/lib/auth";
import { fetchLocalitySummaries, fetchStats, type LocalitySummary } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * The front page: a search, not a directory.
 *
 * It used to open on a column of all 159 localities under the search box,
 * which told a first-time visitor to scroll a list rather than ask about the
 * place they care about — and buried the one thing they most need to know
 * before typing anything, which is whether we cover their city at all.
 *
 * So the order is: where we are (Bengaluru and Gurugram, said before anything
 * else), then the box, with examples of the three kinds of thing it accepts,
 * then "near me". Results appear only once something is typed. The full list
 * still exists, one link away on /localities, which also keeps every locality
 * linked for search engines.
 *
 * The page streams: everything above the box is sent at once, and the search
 * (which needs the locality list) fills in behind a skeleton.
 */

// A locality name, a pincode, a place — one of each kind the box understands.
// The pincode is one no locality stores, so tapping it shows the place lookup.
const EXAMPLES = ["Koramangala", "560092", "Cyber Hub"];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-10 pt-8 sm:pt-12">
      <Masthead />

      <section className="mt-8 sm:mt-12">
        {/* Coverage first. Someone in Pune should learn in one second that this
          * is not for them yet, not after searching for their locality and
          * getting nothing. */}
        <p className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3 py-1.5 text-[12px] font-semibold text-brand-deep">
          <span aria-hidden="true">📍</span>
          Now live in Bengaluru &amp; Gurugram
        </p>

        <h1 className="mt-4 text-[30px] font-bold leading-[1.15] tracking-[-0.02em] sm:text-[38px]">
          Know the neighbourhood
          <br />
          before you commit to it.
        </h1>

        <p className="mt-3 max-w-xl text-[14.5px] leading-[1.6] text-ink-secondary">
          Search a locality, pincode, apartment or landmark. See its schools,
          safety, air, water and connectivity — with the source and date behind
          every number.
        </p>

        <div className="mt-6">
          <Suspense fallback={<SearchSkeleton />}>
            <SearchSection />
          </Suspense>
        </div>
      </section>

      {authConfigured && <ShortlistShortcut />}

      <div className="mt-10 border-t border-hairline pt-8">
        <Suspense fallback={<HomeIntro stats={null} />}>
          <IntroSection />
        </Suspense>
      </div>
    </main>
  );
}

async function SearchSection() {
  let localities: LocalitySummary[];
  try {
    localities = await fetchLocalitySummaries();
  } catch {
    return (
      <div className="rounded-2xl border border-hairline bg-surface-1 p-4 text-[12.5px] text-ink-secondary">
        Couldn&apos;t load the localities just now. Please refresh in a moment.
      </div>
    );
  }

  return (
    <>
      <LocalitySearch
        localities={localities}
        showBrowseList={false}
        examples={EXAMPLES}
        belowInput={
          <div className="mt-5">
            <NearMe key="near-me" localities={localities} />
            <Coverage localities={localities} />
          </div>
        }
      />
    </>
  );
}

/**
 * How much of each city is covered, with the way into the full list.
 *
 * Counts come from the same list the search runs over, so the number here and
 * the number of things you can find cannot disagree.
 */
function Coverage({ localities }: { localities: LocalitySummary[] }) {
  const byCity = new Map<string, number>();
  for (const locality of localities) {
    byCity.set(locality.city, (byCity.get(locality.city) ?? 0) + 1);
  }
  const cities = [...byCity.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="mt-6 rounded-2xl border border-hairline bg-surface-1 p-4">
      <div className="grid grid-cols-2 gap-3">
        {cities.map(([city, count]) => (
          <Link
            key={city}
            href={`/localities?city=${encodeURIComponent(city)}`}
            className="rounded-xl bg-page-plane px-3.5 py-3 transition-colors hover:bg-brand-soft"
          >
            <div className="text-[14px] font-semibold text-ink-primary">{city}</div>
            <div className="mt-0.5 text-[12px] text-ink-secondary">{count} localities</div>
          </Link>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-0.5">
        <p className="text-[11.5px] text-ink-muted">
          Other cities aren&apos;t covered yet — we add areas only where we can
          source data we trust.
        </p>
        <Link href="/localities" className="text-[12px] font-semibold text-brand hover:underline">
          Browse all localities →
        </Link>
      </div>
    </div>
  );
}

/** Stats are decoration on top of the search; losing them must not cost the page. */
async function IntroSection() {
  const stats = await fetchStats().catch(() => null);
  return <HomeIntro stats={stats} />;
}

function SearchSkeleton() {
  return (
    <SkeletonRegion label="Loading search">
      <Bone className="h-[56px] w-full rounded-2xl" />
      <div className="mt-3 flex items-center gap-1.5 px-1">
        <Bone className="h-3 w-6" />
        <Bone className="h-[26px] w-[104px] rounded-full" />
        <Bone className="h-[26px] w-[72px] rounded-full" />
        <Bone className="h-[26px] w-[84px] rounded-full" />
      </div>
      <SlowNotice />
      <Bone className="mt-5 h-[52px] w-full rounded-2xl" />
      <Bone className="mt-6 h-[132px] w-full rounded-2xl" />
    </SkeletonRegion>
  );
}

/**
 * The masthead, reduced to a masthead.
 *
 * This was a 140-pixel gradient panel with decorative map lines drawn across
 * it, and the only thing in it was the logo. On a phone that is a quarter of
 * the first screen spent on nothing.
 */
function Masthead() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-brand text-[13px] font-bold text-white">
        N
      </div>
      <div className="text-[14px] font-bold tracking-[-0.01em]">Neighbour Trust</div>
    </div>
  );
}
