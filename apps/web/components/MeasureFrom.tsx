"use client";

/**
 * "Measure distances from my address."
 *
 * Every distance on a report is measured from the locality centroid, which is
 * one point standing in for an area two or three kilometres across. A school
 * 0.1 km from the middle of BTM Layout can be a twenty-minute walk from the
 * flat someone is actually considering, and the reader has no way to tell which
 * they are looking at.
 *
 * This lets them say where they mean. Nothing else on the page changes: air
 * quality, safety and water stay locality-level, because a crime pattern is not
 * a property of a doorstep the way a school's distance is. The card says which
 * point it measured from, always — a distance whose origin is unstated is the
 * thing this component exists to fix, and it would be perverse to introduce a
 * second one.
 */

import { useState } from "react";

export interface Origin {
  lat: number;
  lon: number;
  label: string;
}

/** Great-circle distance. Fine at these scales; the error is centimetres. */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * How far from the locality centre an address may sit before we say so. These
 * localities are a few kilometres across, so beyond this the reader has almost
 * certainly typed somewhere else — and silently measuring from another
 * neighbourhood is exactly the confusion this component is meant to remove.
 */
const FAR_FROM_LOCALITY_KM = 8;

export function MeasureFrom({
  localityName,
  city,
  centroid,
  origin,
  onChange,
}: {
  localityName: string;
  city: string;
  centroid: { lat: number; lon: number };
  origin: Origin | null;
  onChange: (origin: Origin | null) => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const query = value.trim();
    if (query.length < 3) return;

    setBusy(true);
    setError(null);
    setWarning(null);
    try {
      // POSTed rather than put in the URL: a query string carries the address
      // into the host's access logs beside an IP, and an address is the most
      // personal thing this product handles.
      const response = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, city }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "That address could not be found.");
        return;
      }

      const away = haversineKm(centroid.lat, centroid.lon, body.lat, body.lon);
      if (away > FAR_FROM_LOCALITY_KM) {
        // Shown, not blocked. The address may well be right and our centroid
        // approximate, and refusing to measure would be more annoying than
        // saying plainly what we noticed.
        setWarning(
          `That address is about ${away.toFixed(0)} km from the centre of ${localityName}. ` +
            `Distances below are measured from it anyway — check it is the place you meant.`,
        );
      }
      onChange({ lat: body.lat, lon: body.lon, label: body.label });
    } catch {
      setError("Could not reach the address lookup. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    onChange(null);
    setValue("");
    setError(null);
    setWarning(null);
  }

  return (
    <div className="rounded-2xl border border-hairline bg-page-plane p-3">
      <form onSubmit={search} className="flex flex-wrap items-center gap-2">
        <label
          htmlFor="measure-from"
          className="w-full text-[11px] font-semibold text-ink-secondary"
        >
          {origin
            ? "Measuring from your address"
            : `Measuring from the centre of ${localityName}`}
        </label>
        <input
          id="measure-from"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter an address, road or landmark"
          className="min-w-0 flex-1 rounded-xl border border-gridline bg-surface-1 px-3 py-2 text-[12.5px] text-ink-primary placeholder:text-ink-muted focus:border-brand focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || value.trim().length < 3}
          className="rounded-xl bg-brand px-3.5 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Finding…" : "Measure"}
        </button>
        {origin && (
          <button
            type="button"
            onClick={clear}
            className="rounded-xl border border-gridline px-3 py-2 text-[12px] font-semibold text-ink-secondary"
          >
            Reset
          </button>
        )}
      </form>

      {origin && (
        <p className="mt-2 text-[11px] leading-[1.5] text-ink-secondary">
          Distances below are from <b className="text-ink-primary">{origin.label}</b>.
          Air quality, safety and water still describe the whole locality — those
          are not properties of a single address.
        </p>
      )}
      {warning && (
        <p className="mt-2 text-[11px] leading-[1.5] text-status-warning">{warning}</p>
      )}
      {error && (
        <p className="mt-2 text-[11px] leading-[1.5] text-status-serious">{error}</p>
      )}
      {!origin && !error && (
        <p className="mt-2 text-[11px] leading-[1.5] text-ink-muted">
          The centre of a locality can be two or three kilometres from a
          particular flat. Enter an address to measure from there instead.
        </p>
      )}
    </div>
  );
}
