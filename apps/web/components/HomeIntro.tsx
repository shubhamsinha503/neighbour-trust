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
      <h1 className="mt-6 text-[26px] font-bold leading-[1.2] tracking-[-0.02em]">
        Know the neighbourhood
        <br />
        before you commit to it.
      </h1>

      <p className="mt-2.5 text-[13px] leading-[1.6] text-ink-secondary">
        Air quality, schools and what local press reports about safety and water
        — for {stats ? stats.localities : "44"} localities across Bengaluru and
        Gurugram. Every number says where it came from, how old it is, and how
        much to trust it.
      </p>

      {stats && <Numbers stats={stats} />}
      {stats && stats.sourceNames.length > 0 && (
        <Sources names={stats.sourceNames} />
      )}

      {/* Below the evidence, never above it. See the pratfall note above. */}
      <Honesty stats={stats} />
    </>
  );
}

function Numbers({ stats }: { stats: CoverageStats }) {
  const items: Array<{ value: string; label: string }> = [
    {
      value: stats.schools.toLocaleString("en-IN"),
      label: "schools mapped",
    },
    {
      value: stats.airReadings.toLocaleString("en-IN"),
      label: "air quality readings",
    },
    {
      value: stats.headlinesScreened.toLocaleString("en-IN"),
      label: "headlines screened",
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

function Honesty({ stats }: { stats: CoverageStats | null }) {
  return (
    <div className="mt-5 rounded-2xl border border-hairline bg-surface-1 p-4">
      <p className="text-[12.5px] font-semibold">We show what we don&apos;t know, too</p>
      <p className="mt-1.5 text-[12px] leading-[1.6] text-ink-secondary">
        {stats ? stats.categoriesLive : 4} of six categories have live data.
        Power and infrastructure have none yet, and we leave them empty rather
        than estimating. Safety and water come from local press, which measures{" "}
        <span className="text-ink-primary">
          how much an area gets written about
        </span>{" "}
        as much as what happens there — so we describe the kind of incident
        reported and refuse to turn it into a safety score.
      </p>
      <p className="mt-2 text-[12px] leading-[1.6] text-ink-secondary">
        A locality with too little data gets no overall score at all. That is the
        intended behaviour, not a gap to be filled in later with a guess.
      </p>
    </div>
  );
}
