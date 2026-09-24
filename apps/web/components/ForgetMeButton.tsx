"use client";

/**
 * Withdraw personalisation and erase the stored profile, in one tap.
 *
 * The counterpart to the consent banner, and the DPDP erasure right made
 * concrete: it deletes the server row keyed by this visitor's id and drops the
 * id cookie, so nothing is left to recognise them by. Shown to everyone — if
 * you never consented there is simply nothing to delete, and it says so.
 */

import { useState } from "react";

import { readConsent } from "@/lib/preferences";

export function ForgetMeButton() {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");

  async function forget() {
    setState("busy");
    try {
      await fetch("/api/consent", { method: "DELETE" });
    } catch {
      // The cookie is cleared by the response even if the row delete errored;
      // treat it as done rather than trapping the person in a spinner.
    }
    setState("done");
  }

  if (state === "done") {
    return (
      <p className="mt-3 text-[13px] font-semibold text-brand-deep">
        Done — your preferences and viewing history have been deleted and personalisation is
        off. You can turn it back on anytime from the banner.
      </p>
    );
  }

  const consent = readConsent();
  const consented = consent === "granted" || consent === "outdated";

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={state === "busy"}
        onClick={forget}
        className="rounded-xl border border-hairline bg-surface-1 px-4 py-2 text-[13px] font-semibold text-ink-primary transition-opacity disabled:opacity-50"
      >
        {state === "busy" ? "Deleting…" : "Forget me and delete my preferences and history"}
      </button>
      {!consented && (
        <p className="mt-1.5 text-[12px] text-ink-muted">
          Nothing is stored for you right now — this only does something if you
          turned personalisation on.
        </p>
      )}
    </div>
  );
}
