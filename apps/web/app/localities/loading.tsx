import { Bone, ResultRowSkeleton, SkeletonRegion, SlowNotice } from "@/components/Skeleton";

export default function LocalitiesLoading() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <SkeletonRegion label="Loading localities">
        <Bone className="h-3 w-16" />
        <Bone className="mt-4 h-7 w-44" />
        <Bone className="mt-2 h-3.5 w-56" />
        <Bone className="mt-5 h-[56px] w-full rounded-2xl" />
        <SlowNotice />
        <div className="mt-4 flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <ResultRowSkeleton key={i} />
          ))}
        </div>
      </SkeletonRegion>
    </main>
  );
}
