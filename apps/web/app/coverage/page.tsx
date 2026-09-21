import Link from "next/link";

import { fetchCoverage, type CoverageBuckets } from "@/lib/api";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Coverage",
  // A founder-facing readout, not a page to be found or shared.
  robots: { index: false, follow: false },
};

/**
 * How complete the data is, in aggregate — how many localities hold how many of
 * the five carded categories, per city.
 *
 * Unlisted (no nav link, noindex): this answers an internal question — "where is
 * the data thin?" — rather than a buyer's. It reads the same public endpoint the
 * homepage stats do, so it costs nothing extra.
 */
export default async function CoveragePage() {
  const data = await fetchCoverage().catch(() => null);

  const cities = data
    ? Object.entries(data.cities).sort((a, b) => b[1].total - a[1].total)
    : [];

  // Most complete first: 5 of 5 down to 0.
  const columns = [5, 4, 3, 2, 1, 0];

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link href="/" className="text-[12px] font-semibold text-brand hover:underline">
        ← Neighbour Trust
      </Link>

      <h1 className="mt-5 text-[24px] font-bold leading-[1.25] tracking-[-0.015em]">
        Coverage
      </h1>
      <p className="mt-2.5 text-[13px] leading-[1.65] text-ink-secondary">
        How many localities hold how many of the five report categories — air
        quality, schools, safety, water and connectivity — by city. Counts an
        envelope&apos;s existence, so it can read a little higher than a live
        report where a stale reading is withheld.
      </p>

      {data ? (
        <div className="mt-6 overflow-x-auto rounded-[16px] border border-hairline bg-surface-1">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-hairline text-ink-secondary">
                <th className="px-3.5 py-2.5 text-left font-semibold">City</th>
                {columns.map((c) => (
                  <th key={c} className="px-2 py-2.5 text-right font-semibold tabular-nums">
                    {c}/5
                  </th>
                ))}
                <th className="px-3.5 py-2.5 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {cities.map(([city, b]) => (
                <Row key={city} label={city} buckets={b} columns={columns} />
              ))}
              {data.overall.total > 0 && (
                <Row
                  label="All cities"
                  buckets={data.overall}
                  columns={columns}
                  emphasize
                />
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-6 rounded-[16px] border border-hairline bg-surface-1 p-4 text-[12.5px] text-ink-secondary">
          Couldn&apos;t load coverage just now. Refresh in a moment.
        </p>
      )}
    </main>
  );
}

function Row({
  label,
  buckets,
  columns,
  emphasize,
}: {
  label: string;
  buckets: CoverageBuckets;
  columns: number[];
  emphasize?: boolean;
}) {
  return (
    <tr
      className={
        emphasize
          ? "border-t border-hairline font-semibold"
          : "border-t border-gridline"
      }
    >
      <td className="px-3.5 py-2.5 text-ink-primary">{label}</td>
      {columns.map((c) => {
        const value = buckets.buckets[String(c)] ?? 0;
        // The complete end (4–5 of 5) is the interesting part; grey the zero
        // column so a wall of thin localities doesn't draw the eye first.
        const tone =
          value === 0
            ? "text-ink-muted"
            : c >= 4
              ? "text-brand"
              : "text-ink-primary";
        return (
          <td key={c} className={`px-2 py-2.5 text-right tabular-nums ${tone}`}>
            {value.toLocaleString("en-IN")}
          </td>
        );
      })}
      <td className="px-3.5 py-2.5 text-right tabular-nums text-ink-primary">
        {buckets.total.toLocaleString("en-IN")}
      </td>
    </tr>
  );
}
