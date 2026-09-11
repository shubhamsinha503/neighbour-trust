/**
 * What the local press says is coming to this locality.
 *
 * docs/strategy.md scopes upcoming infrastructure to RERA registrations and
 * state master plans — builder track record and what is approved. That remains
 * the right ambition and remains unreachable: every state runs its own RERA
 * portal with no API, and the master plans are PDFs and shapefiles.
 *
 * But a metro extension or a flyover gets written about, and there is already a
 * per-locality news pipeline with a classifier attached. This is the checkable
 * part of that ambition: not what is approved, but what has been reported.
 *
 * **Headlines, not a summary.** Two of the three confirmed items for Hebbal are
 * about a metro proposal being delayed — "double-decker design delaying the
 * Sarjapur-Hebbal Red Line". Any sentence this component could generate from
 * them ("metro line planned") would convert a stalled proposal into a promise,
 * which is what every builder's brochure does and what this product exists as
 * an alternative to. So the headline is shown verbatim, dated, with a link, and
 * the reader weighs it.
 *
 * **Never a score, and never a date.** Press attention tracks media-market
 * size, so counting what is coming would credit a well-covered neighbourhood
 * with more planned than an identical one nobody writes about — the same
 * distortion the volume rules prevent everywhere else here. And Indian
 * infrastructure announcements slip by years, so this says "reported" rather
 * than "arriving".
 *
 * Absent when nothing was found. Silence is not a finding: a locality nobody
 * writes about is not a locality with nothing planned.
 */

import type { UpcomingItem } from "@/lib/api";

/**
 * Group the classifier's label into something a reader scans.
 *
 * Matched on substrings rather than an exact table, because the classifier is
 * not constrained to a fixed vocabulary — it returns what the headline
 * supports. Hebbal alone produced `metro_line`, `infrastructure_work` and
 * `legal_dispute`, none of which an enum written in advance would have held,
 * and all three of which are worth showing.
 *
 * `legal_dispute` earns its own label rather than being flattened into
 * "Project". A High Court stay on the Hebbal tunnel is the single most
 * decision-relevant thing in that locality's list, and calling it a project
 * would hide the one word that tells a reader it might not happen.
 */
const KIND_RULES: Array<[RegExp, string]> = [
  [/metro|rail|rrts/, "Transit"],
  [/road|flyover|underpass|corridor|expressway|tunnel|junction/, "Roads"],
  [/legal|court|stay|litigat/, "Legal"],
  [/water|sewer|drain|power|electric|utility/, "Utilities"],
  [/hospital|school|park|civic|library/, "Civic"],
];

function kindLabel(kind: string, headline = ""): string {
  const k = (kind || "").toLowerCase();
  for (const [pattern, label] of KIND_RULES) {
    if (pattern.test(k)) return label;
  }
  // Fall back to the headline. The classifier returned `infrastructure_work`
  // for "Hebbal to airport corridor: work on Sadahalli underpass to begin
  // soon" — a label too generic to place, while the headline says plainly what
  // it is. The kind is tried first because it is the model's actual judgement;
  // this only catches what that judgement left vague.
  const h = headline.toLowerCase();
  for (const [pattern, label] of KIND_RULES) {
    if (pattern.test(h)) return label;
  }
  return "Project";
}

function whenText(iso?: string): string | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  return then.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

export function UpcomingCard({
  localityName,
  items,
}: {
  localityName: string;
  items: UpcomingItem[];
}) {
  if (items.length === 0) return null;

  return (
    <section className="mt-4 rounded-[20px] border border-hairline bg-surface-1 p-5">
      <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.05em] text-brand">
        Reported as coming
      </div>
      <h2 className="text-[14.5px] font-semibold leading-[1.4] text-ink-primary">
        What local press has reported about work near {localityName}
      </h2>

      <ul className="mt-3.5 space-y-3">
        {items.map((item, i) => {
          const when = whenText(item.publishedAt);
          return (
            <li key={i} className="border-t border-gridline pt-3 first:border-t-0 first:pt-0">
              <div className="flex items-start gap-2.5">
                <span className="mt-[3px] shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand-deep">
                  {kindLabel(item.kind, item.headline)}
                </span>
                <div className="min-w-0">
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12.5px] font-medium leading-[1.45] text-ink-primary underline decoration-dotted underline-offset-2 hover:text-brand"
                    >
                      {item.headline}
                    </a>
                  ) : (
                    <span className="text-[12.5px] font-medium leading-[1.45] text-ink-primary">
                      {item.headline}
                    </span>
                  )}
                  <div className="mt-0.5 text-[10.5px] text-ink-muted">
                    {[item.source, when].filter(Boolean).join(" · ")}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* The caveat that decides whether this section helps or misleads.
        * Announced is not built, and in India the gap is measured in years. */}
      <p className="mt-4 border-t border-dashed border-gridline pt-3 text-[11px] leading-[1.55] text-ink-muted">
        These are press reports, not commitments. Indian infrastructure projects
        are announced years before they open and many are delayed or dropped —
        several of the headlines above may themselves be about a delay. Nothing
        here counts toward the Trust Score, because how much a locality gets
        written about is not how much is being built there.
      </p>
    </section>
  );
}
