import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";

import { Icon } from "@/components/Icon";
import { LocalitySearch } from "@/components/LocalitySearch";
import { NearMe } from "@/components/NearMe";
import { PopularCities } from "@/components/PopularCities";
import { WhatMatters } from "@/components/WhatMatters";
import { ShortlistShortcut } from "@/components/ShortlistShortcut";
import { Bone, SkeletonRegion, SlowNotice } from "@/components/Skeleton";
import { authConfigured } from "@/lib/auth";
import {
  fetchLocalitySummaries,
  fetchVisitorViews,
  type LocalitySummary,
  type RecentView,
} from "@/lib/api";
import { VISITOR_COOKIE } from "@/lib/preferences";
import { getServerT } from "@/lib/i18n-server";
import { readSavedCity } from "@/lib/serverPrefs";

export const dynamic = "force-dynamic";

/**
 * The front page, laid out to mirror the native app's home screen so the two
 * products read as one: brand + tagline, the "live smarter, live safer" eyebrow,
 * the search, a rail of popular cities, and the "what matters" category grid.
 *
 * The page streams: the masthead and eyebrow are sent at once, and the search +
 * city rail + grid (which need the locality list) fill in behind a skeleton.
 */

const EXAMPLES = ["Koramangala", "Indiranagar", "Whitefield", "560001", "HSR Layout"];

export default async function HomePage() {
  return (
    <main className="relative mx-auto max-w-3xl overflow-hidden px-4 pb-14 pt-7 sm:pt-10">
      {/* Decorative pink blobs, matching the native home. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[320px]">
        <div className="absolute -right-16 -top-20 h-60 w-60 rounded-full bg-brand-soft opacity-70" />
        <div className="absolute -left-14 top-8 h-36 w-36 rounded-full opacity-70" style={{ background: "#FFE1EE" }} />
      </div>

      <div className="relative">
        <Masthead />

        <div className="mt-3.5 inline-flex rounded-full bg-brand-soft px-3 py-1.5">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-brand-deep">
            Live smarter, live safer
          </span>
        </div>
        <h1 className="sr-only">Nestra — honest neighbourhood data for Indian home buyers</h1>

        <div className="mt-4">
          <Suspense fallback={<SearchSkeleton />}>
            <HomeBody />
          </Suspense>
        </div>
      </div>

      {authConfigured && <ShortlistShortcut />}
    </main>
  );
}

function Masthead() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-brand">
        <Icon name="heart" size={17} color="#ffffff" filled />
      </span>
      <div>
        <div className="font-display text-[19px] font-extrabold leading-none tracking-[-0.02em]">Nestra</div>
        <div className="mt-0.5 text-[10.5px] text-ink-muted">know here you live</div>
      </div>
    </div>
  );
}

async function HomeBody() {
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

  const byCity = new Map<string, number>();
  for (const l of localities) byCity.set(l.city, (byCity.get(l.city) ?? 0) + 1);
  const cities = [...byCity.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([city, count]) => ({ city, count }));

  const knownCities = new Set(localities.map((l) => l.city));
  const visitorId = (await cookies()).get(VISITOR_COOKIE)?.value ?? null;
  const [initialCity, recent] = await Promise.all([
    readSavedCity(knownCities),
    visitorId ? fetchVisitorViews(visitorId) : Promise.resolve([] as RecentView[]),
  ]);

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
          </div>
        }
      />
      <PopularCities cities={cities} />
      <WhatMatters />
    </>
  );
}

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
      <Bone className="mt-8 h-[128px] w-full rounded-2xl" />
    </SkeletonRegion>
  );
}
