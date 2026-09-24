import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";

import { LocalitySearch } from "@/components/LocalitySearch";
import { NearMe } from "@/components/NearMe";
import { ShortlistShortcut } from "@/components/ShortlistShortcut";
import { Bone, SkeletonRegion, SlowNotice } from "@/components/Skeleton";
import { LogoMark } from "@/components/Logo";
import { authConfigured } from "@/lib/auth";
import {
  fetchLocalitySummaries,
  fetchVisitorPrefCity,
  fetchVisitorViews,
  type LocalitySummary,
  type RecentView,
} from "@/lib/api";
import { PREF_CITY_COOKIE, VISITOR_COOKIE } from "@/lib/preferences";
import { getServerT } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

/**
 * The front page: a search, not a directory.
 *
 * It used to open on a column of all 159 localities under the search box,
 * which told a first-time visitor to scroll a list rather than ask about the
 * place they care about — and buried the one thing they most need to know
 * before typing anything, which is whether we cover their city at all.
 *
 * So the order is: where we are (the four launch cities, said before anything
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

export default async function HomePage() {
  const { t } = await getServerT();
  return (
    <main className="mx-auto max-w-3xl px-4 pb-10 pt-8 sm:pt-12">
      <Masthead />

      <section className="mt-8 sm:mt-12">
        {/* Coverage is stated by the city tiles further down rather than a badge
          * here, so the hero opens straight on the headline. */}
        <h1 className="text-[30px] font-bold leading-[1.15] tracking-[-0.02em] sm:text-[38px]">
          {t("home.hero1")}
          <br />
          {t("home.hero2")}
        </h1>

        <p className="mt-3 max-w-xl text-[14.5px] leading-[1.6] text-ink-secondary">
          {t("home.heroSub")}
        </p>

        <div className="mt-6">
          <Suspense fallback={<SearchSkeleton />}>
            <SearchSection />
          </Suspense>
        </div>
      </section>

      {authConfigured && <ShortlistShortcut />}
    </main>
  );
}

async function SearchSection() {
  const { t } = await getServerT();
  let localities: LocalitySummary[];
  try {
    localities = await fetchLocalitySummaries();
  } catch {
    return (
      <div className="rounded-2xl border border-hairline bg-surface-1 p-4 text-[12.5px] text-ink-secondary">
        {t("home.loadError")}
      </div>
    );
  }

  // The city filter the visitor last chose, painted on the first frame so there
  // is no flash from empty to filtered. A consented visitor's server-side
  // profile wins (it follows them across devices); otherwise the local
  // functional cookie. A stale value (a city we no longer carry) is ignored
  // rather than shown as an empty list.
  const store = await cookies();
  const visitorId = store.get(VISITOR_COOKIE)?.value ?? null;
  const [prefCity, recent] = visitorId
    ? await Promise.all([fetchVisitorPrefCity(visitorId), fetchVisitorViews(visitorId)])
    : [null, [] as RecentView[]];
  const savedCity = prefCity ?? store.get(PREF_CITY_COOKIE)?.value ?? null;
  const knownCities = new Set(localities.map((l) => l.city));
  const initialCity = savedCity && knownCities.has(savedCity) ? savedCity : null;

  return (
    <>
      <LocalitySearch
        localities={localities}
        showBrowseList={false}
        examples={EXAMPLES}
        initialCity={initialCity}
        belowInput={
          <div className="mt-5">
            {recent.length > 0 && <RecentlyViewed views={recent} />}
            <NearMe key="near-me" localities={localities} />
            <Coverage localities={localities} />
          </div>
        }
      />
    </>
  );
}

/**
 * The localities this visitor opened lately — only ever present for someone who
 * accepted the banner, since history is recorded for no one else. Their own
 * record, shown back to them; "forget me" on the privacy page erases it.
 */
async function RecentlyViewed({ views }: { views: RecentView[] }) {
  const { t } = await getServerT();
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-baseline justify-between px-0.5">
        <div className="text-[12px] font-semibold text-ink-secondary">{t("home.recentlyViewed")}</div>
        <Link href="/privacy" className="text-[11.5px] text-ink-muted hover:underline">
          {t("home.manage")}
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {views.map((v) => (
          <Link
            key={v.slug}
            href={`/${v.slug}`}
            className="rounded-full border border-hairline bg-surface-1 px-3 py-1.5 text-[12.5px] font-semibold text-ink-primary transition-colors hover:bg-brand-soft"
          >
            {v.name}
            <span className="ml-1 font-normal text-ink-muted">· {v.city}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * How much of each city is covered, with the way into the full list.
 *
 * Counts come from the same list the search runs over, so the number here and
 * the number of things you can find cannot disagree.
 */
async function Coverage({ localities }: { localities: LocalitySummary[] }) {
  const { t } = await getServerT();
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
            <div className="mt-0.5 text-[12px] text-ink-secondary">{count} {t("common.localities")}</div>
          </Link>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end px-0.5">
        <Link href="/localities" className="text-[12px] font-semibold text-brand hover:underline">
          {t("common.browseAll")}
        </Link>
      </div>
    </div>
  );
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
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="font-display text-[20px] font-bold tracking-[-0.02em]">
        Neighbour Trust
      </div>
    </div>
  );
}
