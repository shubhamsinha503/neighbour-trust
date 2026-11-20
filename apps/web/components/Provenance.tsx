/**
 * Source, date and confidence for one figure, with the originals one tap away.
 *
 * Server-safe (no hooks): the evidence list uses a native <details>, so a
 * reader can open the original articles without any client JavaScript, and the
 * page stays cacheable.
 */

import { CONFIDENCE_COLOR, CONFIDENCE_LABEL } from "@/lib/aqi";
import type { Evidence } from "@/lib/api";
import type { Confidence } from "@schema/envelope";
import { fmtIstDate } from "@/lib/ist";
import { CONFIDENCE_MEANING } from "@/lib/scoring";

export function ConfidenceTag({ confidence }: { confidence: Confidence }) {
  return (
    <span
      className="inline-flex items-center gap-1 font-semibold text-ink-secondary"
      title={CONFIDENCE_MEANING[confidence]}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: CONFIDENCE_COLOR[confidence] }}
        aria-hidden="true"
      />
      {CONFIDENCE_LABEL[confidence]}
    </span>
  );
}

function isHttp(url: string | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url);
}

export function Provenance({
  sourceName,
  sourceUrl,
  asOf,
  asOfLabel = "Data from",
  fetchedAt,
  confidence,
  evidence = [],
  evidenceLabel = "original reports",
}: {
  sourceName?: string;
  sourceUrl?: string;
  asOf?: string;
  /** "Data from", "Latest report", "Model vintage" … */
  asOfLabel?: string;
  fetchedAt?: string;
  confidence?: Confidence | null;
  evidence?: Evidence[];
  evidenceLabel?: string;
}) {
  const asOfText = fmtIstDate(asOf);
  const fetchedText = fmtIstDate(fetchedAt);
  if (!sourceName && !asOfText && !confidence && evidence.length === 0) return null;

  return (
    <div className="mt-1.5 text-[10.5px] leading-[1.6] text-ink-muted">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        {sourceName && (
          <span>
            Source:{" "}
            {isHttp(sourceUrl) ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-brand underline decoration-dotted underline-offset-2 hover:decoration-solid"
              >
                {sourceName} <span aria-hidden="true">↗</span>
              </a>
            ) : (
              <span className="font-semibold text-ink-secondary">{sourceName}</span>
            )}
          </span>
        )}
        {asOfText && (
          <>
            <span aria-hidden="true">·</span>
            <span>
              {asOfLabel} {asOfText}
            </span>
          </>
        )}
        {fetchedText && fetchedText !== asOfText && (
          <>
            <span aria-hidden="true">·</span>
            <span>checked {fetchedText}</span>
          </>
        )}
        {confidence && (
          <>
            <span aria-hidden="true">·</span>
            <ConfidenceTag confidence={confidence} />
          </>
        )}
      </div>
      {evidence.length > 0 && (
        <details className="group mt-1">
          <summary className="cursor-pointer list-none font-semibold text-brand [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="group-open:hidden">▸</span>
            <span aria-hidden="true" className="hidden group-open:inline">▾</span>{" "}
            {evidence.length} {evidenceLabel}
          </summary>
          <ul className="mt-1 space-y-1 border-l border-gridline pl-2.5">
            {evidence.map((e) => (
              <li key={e.url}>
                <a
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink-secondary underline decoration-dotted underline-offset-2 hover:decoration-solid"
                >
                  {e.headline || e.url}
                </a>
                <span className="text-ink-muted">
                  {[e.source, fmtIstDate(e.publishedAt)].filter(Boolean).length > 0
                    ? ` — ${[e.source, fmtIstDate(e.publishedAt)].filter(Boolean).join(", ")}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
