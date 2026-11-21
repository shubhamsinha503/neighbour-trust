import { CONFIDENCE_COLOR, CONFIDENCE_LABEL } from "@/lib/aqi";
import type { Confidence } from "@schema/envelope";

/**
 * One openable provenance line for a risk indicator: who published it, when, and
 * how much weight it deserves. The source name is a real link to the original
 * when we hold its URL, so a buyer can check the primary rather than take our
 * word — the whole point of an honesty-first report. Date and confidence are
 * passed in already formatted/typed so this stays a dumb presentational row that
 * reads the same under every card (air, schools, connectivity, flood).
 */
export function SourceLine({
  name,
  url,
  date,
  confidence,
}: {
  name: string;
  url?: string;
  /** Pre-formatted publication/measurement date, e.g. formatIst(view.dataVintage). */
  date?: string;
  confidence?: Confidence | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] leading-[1.5] text-ink-muted">
      <span className="font-medium uppercase tracking-[0.04em]">Source</span>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-brand underline decoration-dotted underline-offset-2 hover:decoration-solid"
        >
          {name}
          <span aria-hidden="true"> ↗</span>
        </a>
      ) : (
        <span className="font-semibold text-ink-secondary">{name}</span>
      )}
      {date && <span>· as of {date}</span>}
      {confidence && (
        <span className="inline-flex items-center gap-1.5 font-semibold text-ink-secondary">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: CONFIDENCE_COLOR[confidence] }}
            aria-hidden="true"
          />
          {CONFIDENCE_LABEL[confidence]}
        </span>
      )}
    </div>
  );
}
