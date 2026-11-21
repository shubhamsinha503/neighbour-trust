import Link from "next/link";

/**
 * In-context explanation of what the Trust Score is — and, more importantly,
 * what it is not. The reviewer concern this answers: a buyer can read a high
 * number as a verdict on the whole neighbourhood when it rests on two or three
 * categories that happened to have data. The score chip already names the basis;
 * this says plainly how missing data, weighting and confidence are handled, so
 * incomplete coverage is never mistaken for a reliable overall assessment.
 *
 * A native <details> so it works without JavaScript and adds nothing to the
 * initial render weight; collapsed by default so it informs without shouting.
 */
export function ScoringNote({ counted, total }: { counted: number; total: number }) {
  return (
    <details className="group mt-2.5 rounded-2xl border border-hairline bg-surface-1 px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[12px] font-semibold text-ink-primary [&::-webkit-details-marker]:hidden">
        How is this score worked out?
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          className="shrink-0 text-ink-muted transition-transform group-open:rotate-180"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>

      <div className="mt-2.5 space-y-2 text-[11.5px] leading-[1.6] text-ink-secondary">
        <p>
          The score averages <b>only the categories we have real, dated data for
          in this locality</b>, each weighted by how much it matters to a home
          buyer.{" "}
          {total > 0 && (
            <>
              Here it rests on <b>{counted} of {total}</b>{" "}
              {total === 1 ? "category" : "categories"}.
            </>
          )}
        </p>
        <p>
          A category with nothing sourced yet is <b>left out — never estimated,
          never counted as zero</b>. So a high number built on a couple of
          categories is a statement about those things, not a clean bill of
          health for the whole neighbourhood.
        </p>
        <p>
          Every figure carries a <b>confidence tag</b> — high, medium, low or
          community-reported — based on its source and how recent it is.
        </p>
        <p>
          <b>Safety, water and flood risk are never scored.</b> No official
          source publishes them at locality level, so we describe what local
          press reports rather than turn it into a number that would look more
          certain than it is.
        </p>
        <Link
          href="/about"
          className="inline-block font-semibold text-brand underline decoration-dotted underline-offset-2 hover:decoration-solid"
        >
          Full method &amp; sources →
        </Link>
      </div>
    </details>
  );
}
