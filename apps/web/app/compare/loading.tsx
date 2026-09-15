import { Bone, SkeletonRegion, SlowNotice } from "@/components/Skeleton";

/** The comparison table's shape, while its reports load. */
export default function CompareLoading() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <SkeletonRegion label="Loading the comparison">
        <Bone className="h-3 w-24" />
        <Bone className="mt-4 h-7 w-60" />
        <SlowNotice />
        <div className="mt-6 grid grid-cols-[130px_repeat(3,1fr)] gap-x-3 gap-y-4">
          <span />
          {[0, 1, 2].map((i) => (
            <Bone key={i} className="h-5 w-3/4" />
          ))}
          {Array.from({ length: 8 }).map((_, row) => (
            <div key={row} className="contents">
              <Bone className="h-3.5 w-24" />
              {[0, 1, 2].map((i) => (
                <Bone key={i} className="h-4 w-12" />
              ))}
            </div>
          ))}
        </div>
      </SkeletonRegion>
    </main>
  );
}
