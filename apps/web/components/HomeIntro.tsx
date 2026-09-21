import Link from "next/link";

import type { CoverageStats } from "@/lib/api";

/**
 * The home page's positioning and credibility block.
 *
 * Ordering here is deliberate and comes from docs/strategy.md, which grounds the
 * design in five specific findings. Two of them decide this layout:
 *
 * **Prominence–Interpretation Theory (Fogg, Stanford Web Credibility).** People
 * only judge a credibility cue they actually notice. The sources are the whole
 * argument for this product, so they are named on the first screen rather than
 * left to a footer — an accurate cue nobody sees does no trust work at all.
 *
 * **The pratfall effect (Aronson) and two-sided messaging (Hovland & Weiss).** A
 * source that visibly admits what it doesn't know is trusted more than one that
 * is uniformly confident — but only once competence is already established. So
 * "what we don't have" sits *below* the numbers and the source list, never
 * above. As an opening line it reads as a disclaimer; in this position it reads
 * as an honest accounting from something that has already shown its work.
 *
 * Every figure comes from /api/v1/stats, which counts rows. Nothing here is a
 * marketing number, and the two social-proof figures the mockup sketched
 * ("184 verified residents", "2.3K buyers viewed this month") are deliberately
 * absent: resident reporting does not exist yet, so both would be invented, and
 * inventing the numbers that do the credibility work would defeat the point.
 */
export function HomeIntro({ stats }: { stats: CoverageStats | null }) {
  return (
    <>
      <h2 className="text-[17px] font-bold tracking-[-0.01em]">
        Why you can check our working
      </h2>

      <p className="mt-2 text-[13px] leading-[1.6] text-ink-secondary">
        Air quality, schools and what local press reports about safety and water
        {/* No numeric fallback. This read "44" whenever the stats call
          * failed, which meant a transient API error printed a specific,
          * confident and by then wrong figure — the count had reached 159. An
          * unavailable number should read as unavailable. */}
        — for {stats ? `${stats.localities} localities` : "localities"} across
        Bengaluru, Gurugram, Hyderabad and Mumbai. Every number says where it came from, how old it
        is, and how much to trust it.
      </p>

      {stats && <Numbers stats={stats} />}
      {stats && stats.sourceNames.length > 0 && (
        <Sources names={stats.sourceNames} />
      )}

      {/* The longer "what we don't know" explanation — empty categories, why
        * press coverage is not a safety score, why a thin locality gets no
        * number — moved to the policy page. A visitor reads it once, and it
        * belongs where the full method lives rather than on the front page. */}
      <div className="mt-5">
        <Link
          href="/about"
          className="text-[12.5px] font-semibold text-brand hover:underline"
        >
          How this works, and what we don&apos;t know →
        </Link>
      </div>
    </>
  );
}

function Numbers({ stats }: { stats: CoverageStats }) {
  // Three numbers describing the work: what we gathered, what we sifted, what
  // survived being checked. Together they show a funnel rather than a total,
  // which is the point — a headline count with no screening step behind it is
  // exactly the kind of figure this product exists to distrust.
  //
  // Air quality readings are deliberately not among them. India's regulatory
  // network has been silent since 2026-08-27, so the stored count is currently
  // 19 — a fact about CPCB's outage, not about our coverage, and one that would
  // read as "this product barely works". The outage is disclosed where it
  // actually bears on a decision: on every air quality card, which says no
  // regulatory station is reporting and names the low-cost sensor standing in.
  const items: Array<{ value: string; label: string }> = [
    {
      value: stats.schools.toLocaleString("en-IN"),
      label: "schools mapped",
    },
    {
      value: stats.headlinesScreened.toLocaleString("en-IN"),
      label: "headlines screened",
    },
    {
      value: stats.incidentsConfirmed.toLocaleString("en-IN"),
      label: "incidents verified",
    },
  ];

  return (
    <div className="mt-5 grid grid-cols-3 gap-2.5">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-2xl border border-hairline bg-surface-1 px-3 py-3"
        >
          <div className="text-[18px] font-bold tabular-nums tracking-[-0.02em]">
            {item.value}
          </div>
          <div className="mt-0.5 text-[10.5px] leading-[1.3] text-ink-muted">
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function Sources({ names }: { names: string[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-ink-muted">
        Sourced from
      </span>
      {names.map((name) => (
        <span
          key={name}
          className="rounded-full border border-hairline bg-surface-1 px-2.5 py-1 text-[10.5px] font-medium text-ink-secondary"
        >
          {name}
        </span>
      ))}
    </div>
  );
}

