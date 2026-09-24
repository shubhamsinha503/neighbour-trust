"use client";

import Link from "next/link";

import { saveCityPreference } from "@/lib/preferences";

/**
 * A city tile on the front page. It navigates to that city's list like an
 * ordinary link, and on the way records the city as your preference — the
 * front-page "this is the city I care about" signal. The save is fire-and-forget
 * with a keepalive request, so it survives the navigation that follows the tap;
 * if you have not opted in to the server profile it just writes the local
 * functional cookie, which needs no consent.
 */
export function CityTile({
  city,
  count,
  href,
}: {
  city: string;
  count: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      onClick={() => saveCityPreference(city)}
      className="rounded-xl bg-page-plane px-3.5 py-3 transition-colors hover:bg-brand-soft"
    >
      <div className="text-[14px] font-semibold text-ink-primary">{city}</div>
      <div className="mt-0.5 text-[12px] text-ink-secondary">
        {count} localities
      </div>
    </Link>
  );
}
