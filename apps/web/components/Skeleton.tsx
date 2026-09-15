"use client";

/**
 * Placeholders shaped like the page that is on its way.
 *
 * A blank screen and a spinner both say "wait"; a skeleton says what is coming
 * and where it will be, so the page is already readable as a layout before the
 * numbers arrive, and nothing jumps when they do. Every block here matches the
 * size of the real element it stands in for.
 *
 * The pulse is `motion-safe` only: someone who has asked their device for
 * reduced motion gets still grey blocks, not a flashing page.
 *
 * `SlowNotice` exists because of where this runs. The API is on a free tier
 * that sleeps after fifteen minutes idle, and the first request after that
 * takes thirty to fifty seconds. A skeleton that pulses silently for forty
 * seconds is indistinguishable from a broken site; after a few seconds it says
 * what is actually happening.
 */

import { useEffect, useState } from "react";

export function Bone({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-md bg-[#e8e7e1] motion-safe:animate-pulse ${className}`}
    />
  );
}

/** Wraps a skeleton so screen readers hear one "loading" rather than silence. */
export function SkeletonRegion({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function SlowNotice({ afterMs = 5000 }: { afterMs?: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - started), 1000);
    return () => clearInterval(timer);
  }, []);

  if (elapsed < afterMs) return null;

  return (
    <p className="mt-3 rounded-xl border border-hairline bg-surface-1 px-3.5 py-2.5 text-[12px] leading-[1.5] text-ink-secondary">
      {elapsed < 20000
        ? "Still loading — our server is waking up. The first visit after a quiet spell can take up to a minute."
        : "Nearly there. The server was asleep and is starting up; after this, pages load in about a second."}
    </p>
  );
}

/** One search result row: score chip on the left, name and a flag line. */
export function ResultRowSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-hairline bg-surface-1 p-3.5">
      <div className="flex w-[46px] shrink-0 flex-col items-center gap-1">
        <Bone className="h-[42px] w-[42px] rounded-xl" />
        <Bone className="h-2 w-8" />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-baseline gap-2">
          <Bone className="h-4 w-32" />
          <Bone className="h-3 w-16" />
        </div>
        <Bone className="mt-2 h-3 w-4/5" />
      </div>
    </div>
  );
}

/** The locality report: score card with map, then the category grid. */
export function ReportSkeleton() {
  return (
    <>
      <section className="rounded-[20px] border border-hairline bg-surface-1 p-5">
        <div className="flex items-start gap-4">
          <Bone className="h-[76px] w-[76px] shrink-0 rounded-full" />
          <div className="flex-1 pt-1">
            <Bone className="h-3 w-40" />
            <Bone className="mt-2.5 h-4 w-full" />
            <Bone className="mt-2 h-4 w-3/4" />
          </div>
        </div>
        <Bone className="mt-4 h-[52px] w-full rounded-xl" />
        <Bone className="mt-4 aspect-square w-full rounded-2xl" />
        <div className="mt-3 flex gap-2 border-t border-dashed border-gridline pt-3">
          <Bone className="h-5 w-24" />
          <Bone className="h-5 w-20" />
          <Bone className="h-5 w-28" />
        </div>
      </section>

      <div className="mb-2.5 mt-6 flex items-center justify-between">
        <Bone className="h-3 w-24" />
        <Bone className="h-3 w-28" />
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <CategoryCardSkeleton key={i} />
        ))}
      </div>
    </>
  );
}

export function CategoryCardSkeleton() {
  return (
    <div className="rounded-2xl border border-hairline bg-surface-1 p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <Bone className="h-3.5 w-20" />
        <Bone className="h-5 w-8" />
      </div>
      <Bone className="h-[5px] w-full rounded-[3px]" />
      <div className="mt-3 flex items-center justify-between">
        <Bone className="h-2.5 w-24" />
        <Bone className="h-2.5 w-10" />
      </div>
    </div>
  );
}

/** A detail card (schools, connectivity, air quality): meter, tiles, list. */
export function DetailCardSkeleton() {
  return (
    <article className="rounded-[20px] border border-hairline bg-surface-1 p-5">
      <div className="mb-4 flex items-start gap-4">
        <Bone className="h-[76px] w-[76px] shrink-0 rounded-full" />
        <div className="flex-1 pt-1">
          <Bone className="h-3 w-28" />
          <Bone className="mt-2.5 h-4 w-full" />
          <Bone className="mt-2 h-4 w-2/3" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Bone key={i} className="h-[68px] rounded-xl" />
        ))}
      </div>
      <div className="mt-5 space-y-2.5 border-t border-gridline pt-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <Bone className="h-3.5 w-3/5" />
              <Bone className="mt-1.5 h-2.5 w-2/5" />
            </div>
            <Bone className="h-4 w-10" />
          </div>
        ))}
      </div>
    </article>
  );
}

/** Two or three answer lines, for the question box while it thinks. */
export function AnswerSkeleton() {
  return (
    <div className="mt-4 border-t border-gridline pt-4">
      <Bone className="h-2.5 w-44" />
      <Bone className="mt-3 h-3.5 w-full" />
      <Bone className="mt-2 h-3.5 w-11/12" />
      <Bone className="mt-2 h-3.5 w-3/5" />
    </div>
  );
}
