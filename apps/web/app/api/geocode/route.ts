/**
 * Turn a typed address into a point, so distances can be measured from where
 * someone actually is rather than from the middle of a neighbourhood.
 *
 * Every distance this product shows is measured from the locality centroid —
 * one point standing in for an area two or three kilometres across. That
 * answers "near this neighbourhood", which is not the question a buyer is
 * asking about a specific flat.
 *
 * **Why this is a server route rather than a fetch from the browser.**
 * Nominatim is donated infrastructure with a usage policy, and the policy is
 * enforceable only from one place. Here we can identify ourselves honestly in
 * the User-Agent, hold to the one-request-per-second limit across all visitors
 * rather than per-tab, and cache repeats. Calling it from the browser would put
 * the visitor's IP and our compliance in the hands of whatever page happened to
 * be open. It also means swapping to a paid provider later is a change to this
 * file and an environment variable, never a frontend rewrite.
 *
 * Deliberately not an autocomplete. Nominatim's policy forbids per-keystroke
 * querying, and a submit-to-search box is both compliant and cheaper — which
 * matters because the provider we would move to charges per call.
 */

import { NextResponse } from "next/server";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

/**
 * Sent on every request, as Nominatim's policy requires: a real application
 * name and a way to contact whoever is responsible. Configurable because the
 * contact address is a deployment fact, not a source-code one.
 */
const CONTACT = process.env.GEOCODER_CONTACT ?? "https://neighbourtrust.com";
const USER_AGENT = `NeighbourTrust/0.1 (${CONTACT})`;

/**
 * Both launch cities, as bounding boxes. Searches are biased to these rather
 * than restricted: "Sector 45" alone matches sectors in a dozen Indian cities,
 * and a buyer typing it on the Gurugram page means the Gurugram one.
 */
const CITY_VIEWBOX: Record<string, string> = {
  // left,top,right,bottom — Nominatim's ordering, not the usual one.
  Bengaluru: "77.35,13.20,77.85,12.75",
  Gurugram: "76.85,28.55,77.20,28.30",
};

// One request per second, shared across visitors. Nominatim asks for this and
// the alternative to honouring it is being blocked, which would take the
// feature down for everyone rather than slowing one person slightly.
const MIN_GAP_MS = 1100;
let lastCallAt = 0;

// Repeat lookups are common — the same few localities, typed the same way — and
// every one avoided is one we did not take from a volunteer-run service.
const cache = new Map<string, { lat: number; lon: number; label: string }>();
const CACHE_MAX = 500;

function tooSoon(): number {
  const wait = lastCallAt + MIN_GAP_MS - Date.now();
  return wait > 0 ? wait : 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim();
  const city = searchParams.get("city") ?? "";

  if (query.length < 3) {
    return NextResponse.json(
      { error: "Type a few more characters." },
      { status: 400 },
    );
  }

  // The city is appended rather than trusted as a filter: Nominatim ranks a
  // full address string far better than it honours a bounded search, and a
  // buyer types "Sector 45" without the city because they are already on that
  // city's page.
  const full = city && !query.toLowerCase().includes(city.toLowerCase())
    ? `${query}, ${city}, India`
    : `${query}, India`;

  const key = full.toLowerCase();
  const hit = cache.get(key);
  if (hit) {
    return NextResponse.json({ ...hit, cached: true });
  }

  const params = new URLSearchParams({
    q: full,
    format: "jsonv2",
    limit: "1",
    addressdetails: "0",
    countrycodes: "in",
  });
  const viewbox = CITY_VIEWBOX[city];
  if (viewbox) params.set("viewbox", viewbox);

  try {
    const wait = tooSoon();
    if (wait) await sleep(wait);
    lastCallAt = Date.now();

    const response = await fetch(`${NOMINATIM}?${params}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      // Nominatim is occasionally slow; better a clear timeout than a hung page.
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "The address lookup service is busy. Try again in a moment." },
        { status: 503 },
      );
    }

    const results = (await response.json()) as Array<Record<string, string>>;
    if (!results.length) {
      return NextResponse.json(
        {
          error:
            "We could not find that address. Try a nearby landmark, road or sector instead.",
        },
        { status: 404 },
      );
    }

    const found = {
      lat: Number(results[0].lat),
      lon: Number(results[0].lon),
      label: results[0].display_name ?? full,
    };

    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(key, found);

    return NextResponse.json(found);
  } catch {
    // The reason is logged nowhere the visitor can see, and naming the upstream
    // service in the message would be blaming a volunteer project for our
    // page being slow.
    return NextResponse.json(
      { error: "The address lookup did not respond. Try again in a moment." },
      { status: 503 },
    );
  }
}
