"use client";

/**
 * Ask a question about this locality, answered only from what we hold.
 *
 * The answer's citations render as numbered chips that open the source they
 * name, and the sources are listed under the answer with their date and link.
 * A citation a reader cannot follow is decoration, and this product's whole
 * claim is that every statement can be traced.
 *
 * "We don't have data on that" is styled as an ordinary answer rather than an
 * error. For most localities it is the most common reply, and it is correct —
 * presenting it as a failure would push people toward rephrasing until the
 * model reaches for an adjacent fact.
 */

import { useState } from "react";
import { AnswerSkeleton, SkeletonRegion } from "@/components/Skeleton";
import { splitCitations } from "@/lib/citations";

type Citation = {
  id: number;
  kind: string;
  text: string;
  label?: string | null;
  url?: string | null;
  vintage?: string | null;
};

type AskResult = {
  answerable: boolean;
  answer: string;
  citations: Citation[];
};

// Starting points, not a menu. Each is a question a buyer actually asks and
// that the data can at least honestly decline.
const SUGGESTIONS = [
  "Is there a metro nearby or coming?",
  "Has flooding or waterlogging been reported?",
  "What has been reported about safety?",
];

const KIND_LABEL: Record<string, string> = {
  category: "Category data",
  category_absent: "No data held",
  trust_score: "Trust Score",
  flag: "Flag",
  disagreement: "Sources disagree",
  upcoming: "Press report",
  headline: "Press headline",
  resident_report: "Resident report",
  locality: "Locality",
};

function formatDay(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function AskBox({ slug, localityName }: { slug: string; localityName: string }) {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask(text: string) {
    const q = text.trim();
    if (q.length < 3 || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setAsked(q);
    try {
      const response = await fetch(`/api/ask/${slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          typeof data?.detail === "string"
            ? data.detail
            : "Something went wrong. Please try again.",
        );
      } else {
        setResult(data as AskResult);
      }
    } catch {
      setError("Could not reach us. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const citationIds = result?.citations.map((c) => c.id) ?? [];

  return (
    <section className="mt-6 rounded-[20px] border border-hairline bg-surface-1 p-5">
      <div className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.05em] text-brand">
        Ask about {localityName}
      </div>
      <p className="text-[12.5px] leading-[1.5] text-ink-secondary">
        Answered only from the data on this page, with every claim linked to its
        source. If we don&apos;t hold something, it says so.
      </p>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
      >
        <label htmlFor="ask-question" className="sr-only">
          Your question about {localityName}
        </label>
        <input
          id="ask-question"
          type="text"
          value={question}
          maxLength={400}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="e.g. Is there waterlogging in the monsoon?"
          className="min-w-0 flex-1 rounded-xl border border-hairline bg-white px-3 py-2.5 text-[13.5px] text-ink-primary placeholder:text-ink-muted focus:border-brand focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || question.trim().length < 3}
          className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Checking…" : "Ask"}
        </button>
      </form>

      {!result && !loading && !error && (
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                setQuestion(suggestion);
                ask(suggestion);
              }}
              className="rounded-full border border-hairline px-3 py-1.5 text-[11.5px] text-ink-secondary hover:border-brand hover:text-brand"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      <div aria-live="polite">
        {loading && (
          <SkeletonRegion label={`Reading everything we hold on ${localityName}`}>
            <p className="mt-4 text-[11px] font-medium text-ink-muted">{asked}</p>
            <AnswerSkeleton />
          </SkeletonRegion>
        )}

        {error && <p className="mt-4 text-[12.5px] text-ink-secondary">{error}</p>}

        {result && (
          <div className="mt-4 border-t border-gridline pt-4">
            <div className="text-[11px] font-medium text-ink-muted">{asked}</div>
            <p className="mt-1.5 text-[14px] leading-[1.6] text-ink-primary">
              {splitCitations(result.answer, citationIds).map((part, i) =>
                part.type === "text" ? (
                  <span key={i}>{part.value}</span>
                ) : (
                  <a
                    key={i}
                    href={`#ask-source-${part.id}`}
                    className="mx-0.5 inline-block rounded-md bg-brand-soft px-1.5 align-[1px] text-[10.5px] font-semibold text-brand-deep no-underline"
                    aria-label={`Source ${part.id}`}
                  >
                    {part.id}
                  </a>
                ),
              )}
            </p>

            {result.citations.length > 0 && (
              <ol className="mt-3.5 space-y-2.5">
                {result.citations.map((citation) => {
                  const meta = [
                    KIND_LABEL[citation.kind] ?? citation.kind,
                    citation.label,
                    formatDay(citation.vintage),
                  ].filter(Boolean);
                  return (
                    <li
                      key={citation.id}
                      id={`ask-source-${citation.id}`}
                      className="flex gap-2.5 text-[11.5px] leading-[1.5]"
                    >
                      <span className="mt-[1px] inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-md bg-brand-soft px-1 text-[10px] font-semibold text-brand-deep">
                        {citation.id}
                      </span>
                      <div className="min-w-0">
                        <div className="text-ink-primary">
                          {citation.url ? (
                            <a
                              href={citation.url}
                              target="_blank"
                              rel="noreferrer"
                              className="underline decoration-dotted underline-offset-2 hover:text-brand"
                            >
                              {citation.text}
                            </a>
                          ) : (
                            citation.text
                          )}
                        </div>
                        <div className="mt-0.5 text-[10.5px] text-ink-muted">{meta.join(" · ")}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            <p className="mt-3.5 text-[10.5px] leading-[1.5] text-ink-muted">
              Written by an AI model from the sources listed, and checked so it
              can only cite sources that exist. It can still misread one — the
              sources are the record. Questions are not stored.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
