"use client";

/**
 * "We don't have it — ask us to add it."
 *
 * Shown wherever a search comes up short: no locality by that name, a place
 * outside the two cities, or a lookup that found only nearby localities. What
 * people ask for, and how often, decides what is added next.
 *
 * Anonymous. Nothing is asked for beyond the place, and nothing about the
 * person is sent (see app/privacy). One request per query per page view.
 */

import { useState } from "react";

export type RequestContext = {
  query: string;
  city?: string | null;
  placeLabel?: string;
  lat?: number;
  lon?: number;
  nearestSlug?: string;
  nearestKm?: number;
};

type State =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; times: number }
  | { status: "failed"; message: string };

// Requests already sent this page view, so the same place is not submitted
// twice by tapping again or by the prompt re-rendering.
const sentThisVisit = new Map<string, number>();

function keyOf(query: string): string {
  return query.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function RequestLocality({
  context,
  variant = "card",
}: {
  context: RequestContext;
  /** "card" where the search found nothing; "link" beneath results that may not be it. */
  variant?: "card" | "link";
}) {
  const already = sentThisVisit.get(keyOf(context.query));
  const [state, setState] = useState<State>(
    already ? { status: "sent", times: already } : { status: "idle" },
  );

  async function send() {
    setState({ status: "sending" });
    const response = await fetch("/api/locality-request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(context),
    }).catch(() => null);
    const data = await response?.json().catch(() => null);
    if (!response || !response.ok) {
      setState({ status: "failed", message: data?.detail ?? "Couldn't send that. Please try again." });
      return;
    }
    const times = typeof data?.times_requested === "number" ? data.times_requested : 1;
    sentThisVisit.set(keyOf(context.query), times);
    setState({ status: "sent", times });
  }

  const name = context.query.trim();

  if (state.status === "sent") {
    return (
      <p
        className={
          variant === "card"
            ? "mt-3 rounded-xl bg-brand-soft px-3.5 py-2.5 text-[12.5px] leading-[1.5] text-brand-deep"
            : "mt-2 px-1 text-[11.5px] text-brand-deep"
        }
        role="status"
      >
        <span aria-hidden="true">✓ </span>
        Thanks — we&apos;ve noted &ldquo;{name}&rdquo;.
        {state.times > 1 ? ` ${state.times} people have asked for it so far.` : ""} We add
        areas where we can find data we trust.
      </p>
    );
  }

  if (variant === "link") {
    return (
      <div className="mt-2 px-1">
        <button
          type="button"
          onClick={send}
          disabled={state.status === "sending"}
          className="text-left text-[11.5px] font-medium text-ink-secondary underline decoration-dotted underline-offset-2 hover:text-brand disabled:opacity-60"
        >
          {state.status === "sending"
            ? "Sending…"
            : `Not the locality you wanted? Ask us to add “${name}”`}
        </button>
        {state.status === "failed" && (
          <p className="mt-1 text-[11px] text-[#c0442c]">{state.message}</p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-dashed border-gridline pt-3">
      <p className="text-[12px] leading-[1.5] text-ink-secondary">
        Want us to cover it? Tell us — the most-requested places are added first.
      </p>
      <button
        type="button"
        onClick={send}
        disabled={state.status === "sending"}
        className="mt-2 rounded-xl border border-brand px-3.5 py-2 text-[12.5px] font-semibold text-brand hover:bg-brand-soft disabled:opacity-60"
      >
        {state.status === "sending" ? "Sending…" : `Ask us to add “${name}”`}
      </button>
      {state.status === "failed" && (
        <p className="mt-1.5 text-[11.5px] text-[#c0442c]">{state.message}</p>
      )}
    </div>
  );
}
