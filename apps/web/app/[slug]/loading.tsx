import { Bone, ReportSkeleton, SkeletonRegion, SlowNotice } from "@/components/Skeleton";

/**
 * Shown the instant a locality is tapped, while its report loads.
 *
 * Next.js streams this before the page's data arrives and prefetches it for
 * locality links in view, so tapping a search result changes the screen at
 * once instead of leaving the old page up until the new one is complete.
 */
export default function LocalityLoading() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <SkeletonRegion label="Loading the locality report">
        <Bone className="h-3 w-24" />
        <div className="mb-5 mt-3">
          <Bone className="h-7 w-48" />
          <Bone className="mt-2 h-3.5 w-36" />
        </div>
        <SlowNotice />
        <div className="mt-3">
          <ReportSkeleton />
        </div>
      </SkeletonRegion>
    </main>
  );
}
