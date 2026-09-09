"use client";

/**
 * "Show me where I am" — the first thing a stranger can usefully do here.
 *
 * Someone landing with no idea what this is cannot be taught by copy. They can
 * be shown: one tap, and the report for the neighbourhood they are standing in.
 * A place they already know is the only fair test of whether these numbers are
 * any good, and it is a far better demonstration than any amount of homepage
 * text about sources and confidence tags.
 *
 * Someone who declines has, by declining, told us they arrived with an area
 * already in mind — so the search box stays exactly where it was, equally
 * prominent, and this is an offer rather than a gate.
 *
 * **The coordinates never leave the browser.** The index already carries every
 * locality's centre in order to render, so the nearest match is computed here
 * against a list the page is holding anyway. Nothing is sent to our server,
 * nothing is stored, and there is no request to a geocoder — which is what lets
 * app/privacy/page.tsx keep saying we hold nothing about you. Sending a
 * position to the server to do the same arithmetic would have been easier and
 * would have made that page false.
 *
 * **It asks on a tap, not on load.** Firing the browser's permission dialog at
 * a visitor who does not yet know what the site is produces refusals — and
 * Chrome and Safari both penalise origins whose prompts get dismissed, up to
 * blocking the prompt outright for everyone. A button shown to every visitor
 * reaches the same people without spending that credit. If the prompt should
 * fire unprompted after all, this is the one line to change.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { LocalitySummary } from "@/lib/api";

/**
 * Past this, "your locality" would be a lie.
 *
 * Browser positioning is GPS-accurate on a phone and often tens of kilometres
 * out on a desktop, where it is derived from the network. Six kilometres is
 * wide enough to place someone within a covered city and narrow enough that a
 * visitor in Pune is told we do not cover them rather than being shown
 * Bengaluru with a straight face.
 */
export const MAX_MATCH_KM = 6;

export function distanceKm(
  lat1: number, lon1: number, lat2: number, lon2: number,
): number {
  const r = 6371;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const h =
    Math.sin(dp / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/** The closest covered locality, or null when none is close enough to claim. */
export function nearestLocality(
  lat: number,
  lon: number,
  localities: LocalitySummary[],
  maxKm: number = MAX_MATCH_KM,
): { locality: LocalitySummary; km: number } | null {
  let best: { locality: LocalitySummary; km: number } | null = null;
  for (const locality of localities) {
    // A locality with no coordinate cannot be matched against. This is not
    // hypothetical: the summary endpoint omitted lat/lon until this feature
    // needed them, and every entry defaulted to (0, 0) — a point in the
    // Atlantic that would have been "nearest" to nobody, or to everybody.
    if (!locality.lat || !locality.lon) continue;
    const km = distanceKm(lat, lon, locality.lat, locality.lon);
    if (!best || km < best.km) best = { locality, km };
  }
  return best && best.km <= maxKm ? best : null;
}

type State =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "uncovered" }
  | { status: "denied" }
  | { status: "unavailable"; message: string };

export function NearMe({ localities }: { localities: LocalitySummary[] }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "idle" });

  function locate() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({
        status: "unavailable",
        message: "This browser can't share a location.",
      });
      return;
    }

    setState({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const match = nearestLocality(
          position.coords.latitude,
          position.coords.longitude,
          localities,
        );
        if (!match) {
          setState({ status: "uncovered" });
          return;
        }
        router.push(`/${match.locality.slug}`);
      },
      (error) => {
        setState(
          error.code === error.PERMISSION_DENIED
            ? { status: "denied" }
            : {
                status: "unavailable",
                message: "Couldn't get a location just now.",
              },
        );
      },
      // A coarse fix is enough to pick between neighbourhoods kilometres apart,
      // and asking for high accuracy costs battery and seconds for precision
      // this cannot use. A cached fix up to five minutes old is fine too.
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={locate}
        disabled={state.status === "locating"}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <svg
          width="17" height="17" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.2" aria-hidden="true"
        >
          <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
          <circle cx="12" cy="10" r="2.6" />
        </svg>
        {state.status === "locating" ? "Finding you…" : "Show my neighbourhood"}
      </button>

      <p className="mt-2 text-center text-[11px] leading-[1.5] text-ink-muted">
        {state.status === "idle" || state.status === "locating" ? (
          <>Your location stays in your browser — it is never sent to us.</>
        ) : state.status === "uncovered" ? (
          <>
            We don&apos;t cover your area yet — we&apos;re in Bengaluru and
            Gurugram so far. Search for a locality there instead.
          </>
        ) : state.status === "denied" ? (
          <>No problem — search for the area you have in mind below.</>
        ) : (
          <>{state.message} Search for a locality below instead.</>
        )}
      </p>
    </div>
  );
}
