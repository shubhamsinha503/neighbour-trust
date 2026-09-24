"use client";

/**
 * The one consent this site asks for.
 *
 * Personalising across visits and devices means keeping preferences against a
 * per-person id, and that is the thing the privacy page says we ask before
 * doing. This banner is the asking. It appears once, until answered; the answer
 * is remembered in a readable cookie so it never nags again.
 *
 * Everything here is opt-in and reversible: "No thanks" stores a plain denial
 * and nothing else, and even after "Yes" the privacy page has a one-tap "forget
 * me". The functional city cookie the app already sets is a separate, local
 * thing that needs no consent — this is only about the server-side profile.
 */

import { useEffect, useState } from "react";

import { PREF_CITY_COOKIE, readConsent } from "@/lib/preferences";

function readCity(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${PREF_CITY_COOKIE}=([^;]*)`),
  );
  return m ? decodeURIComponent(m[1]) : null;
}

export function ConsentBanner() {
  // `null` until mounted, so the server and the first client render agree on
  // "nothing", and the banner only appears once we have read the cookie.
  const [show, setShow] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setShow(readConsent() === null);
  }, []);

  async function answer(grant: boolean) {
    setBusy(true);
    try {
      await fetch("/api/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grant }),
      });
      // Carry the choice they already made this visit up to their new profile,
      // so granting does not lose the city they were just looking at.
      if (grant) {
        const city = readCity();
        await fetch("/api/prefs", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ city }),
        }).catch(() => {});
      }
    } catch {
      // If the network is down, still take the banner away — pressing a button
      // and having nothing happen is worse than trying again next visit.
    } finally {
      setShow(false);
      setBusy(false);
    }
  }

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-label="Remember my preferences"
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-2"
    >
      <div className="mx-auto max-w-3xl rounded-2xl border border-hairline bg-surface-1 p-4 shadow-[0_6px_24px_rgba(0,0,0,0.12)]">
        <p className="text-[13px] leading-[1.6] text-ink-secondary">
          <span className="font-semibold text-ink-primary">
            Remember your preferences?
          </span>{" "}
          We can keep the city you look at on our side, tied to a private id that
          never shows who you are — so it&apos;s remembered for you, and carries
          across your devices once you sign in. You can undo it anytime.{" "}
          <a href="/privacy" className="font-semibold text-brand hover:underline">
            How this works
          </a>
          .
        </p>
        <div className="mt-3 flex items-center gap-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => answer(true)}
            className="rounded-xl bg-brand px-4 py-2 text-[13px] font-semibold text-white transition-opacity disabled:opacity-50"
          >
            Yes, remember
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => answer(false)}
            className="rounded-xl bg-page-plane px-4 py-2 text-[13px] font-semibold text-ink-secondary transition-opacity disabled:opacity-50"
          >
            No thanks
          </button>
        </div>
      </div>
    </div>
  );
}
