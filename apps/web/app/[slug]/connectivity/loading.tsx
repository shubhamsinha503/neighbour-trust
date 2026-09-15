import { Bone, DetailCardSkeleton, SkeletonRegion, SlowNotice } from "@/components/Skeleton";

/** Shown at once while this category's detail loads. See app/[slug]/loading.tsx. */
export default function DetailLoading() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <SkeletonRegion label="Loading details">
        <Bone className="h-3 w-24" />
        <Bone className="mb-5 mt-4 h-6 w-56" />
        <SlowNotice />
        <div className="mt-3">
          <DetailCardSkeleton />
        </div>
      </SkeletonRegion>
    </main>
  );
}
