/**
 * What is around a locality, drawn rather than described.
 *
 * This product is about places and had no picture of one. Every locality page
 * rendered the same green ring above the same stacked paragraphs, so
 * Koramangala and Yelahanka looked identical — on a product whose subject is
 * the difference between them.
 *
 * The data was already there. The connectivity agent stores every mapped
 * feature with its coordinates, and until now those were used only to compute a
 * distance and then discarded into a sentence. "Industrial land 0.7 km away" is
 * a fact you have to hold in your head; a red block beside the centre is one
 * you see.
 *
 * **Drawn as SVG, with no tile server.** The obvious approach is a slippy map
 * over OpenStreetMap's raster tiles, and it is the wrong one here for three
 * reasons. Their tile servers are donated infrastructure with an etiquette
 * policy — precisely the dependency the connectivity agent just escaped after
 * Overpass never completed a run. It would put a third-party request on every
 * page view, which the privacy page would then have to describe. And it would
 * need a mapping library, in an app that has three runtime dependencies.
 *
 * So the geometry is projected here and drawn as plain shapes. No network, no
 * dependency, no client JavaScript, and it renders on the server like the rest
 * of the page.
 *
 * **What it deliberately does not show.** No streets, no building outlines, no
 * base map. This is not a navigational map and should not be read as one: it is
 * the set of things we measured, positioned relative to the locality centre.
 * Drawing a convincing street map around data we have not verified would imply
 * a completeness we do not have — the same reason the cards say "not mapped"
 * rather than "nothing here".
 */

import type { ConnectivityFeature } from "@/lib/api";

// Matches agents/infrastructure/sources/osm_extract: amenities are collected
// within 2.5 km and industrial land within 3.5 km, so the frame has to be the
// wider of the two or industrial sites would fall off the edge.
const AMENITY_RADIUS_KM = 2.5;
const FRAME_RADIUS_KM = 3.5;

const SIZE = 320;          // viewBox units, square
const CENTRE = SIZE / 2;
const SCALE = (SIZE / 2 - 10) / FRAME_RADIUS_KM;   // units per km, with a margin

type Kind = ConnectivityFeature["kind"];

// Ordered back-to-front: industrial land is drawn first so a hospital sitting
// on top of it stays visible, and the centre marker last so nothing hides it.
const DRAW_ORDER: Kind[] = [
  "industrial_sites", "parks", "markets", "clinics", "hospitals", "metro_rail",
];

const STYLE: Record<Kind, { fill: string; r: number; label: string }> = {
  // The one signal that counts against a locality, in the colour the cards use
  // for a warning. Larger because it is usually an area rather than a point,
  // and because it is the thing a buyer is least likely to find out otherwise.
  industrial_sites: { fill: "var(--color-status-serious)", r: 4.5, label: "Industrial land" },
  parks:            { fill: "var(--color-status-good)",    r: 2.6, label: "Parks" },
  markets:          { fill: "var(--color-series-violet)",  r: 2.4, label: "Supermarkets" },
  clinics:          { fill: "var(--color-series-blue)",    r: 2.2, label: "Clinics" },
  hospitals:        { fill: "var(--color-series-blue)",    r: 3.4, label: "Hospitals" },
  metro_rail:       { fill: "var(--color-brand-deep)",     r: 4.2, label: "Stations" },
};

export function project(
  lat: number, lon: number, centreLat: number, centreLon: number,
): { x: number; y: number; km: number } {
  // Equirectangular about the centre. Over a 7 km square the error is far below
  // one pixel, and it keeps this dependency-free and server-rendered.
  const kmPerDegLat = 110.574;
  const kmPerDegLon = 111.32 * Math.cos((centreLat * Math.PI) / 180);
  const eastKm = (lon - centreLon) * kmPerDegLon;
  const northKm = (lat - centreLat) * kmPerDegLat;
  return {
    // Rounded, and that is load-bearing rather than tidiness. Unrounded, the
    // server and the browser disagreed in the last decimal place —
    // 39.38441675762962 against ...64 — which React reports as a hydration
    // mismatch on every dot. Two decimals is a hundredth of a viewBox unit,
    // far below a pixel, and it makes the markup deterministic.
    x: Math.round((CENTRE + eastKm * SCALE) * 100) / 100,
    y: Math.round((CENTRE - northKm * SCALE) * 100) / 100,  // north must go up
    km: Math.hypot(eastKm, northKm),
  };
}

export function LocalityMap({
  localityName,
  lat,
  lon,
  features,
}: {
  localityName: string;
  lat: number;
  lon: number;
  features: ConnectivityFeature[];
}) {
  const placed = features
    .map((f) => ({ ...f, ...project(f.lat, f.lon, lat, lon) }))
    .filter((f) => f.km <= FRAME_RADIUS_KM);

  if (placed.length === 0) return null;

  const present = DRAW_ORDER.filter((k) => placed.some((f) => f.kind === k));

  // Named stations are the one label worth the clutter: they are what people
  // recognise, and there are rarely more than a handful.
  // Only stations far enough apart to be readable get a label. Koramangala's
  // two nearest sit almost on top of each other and their names overprinted
  // into an unreadable smear; a label that cannot be read is worse than none,
  // because it still costs the space and the ink.
  // Separation is measured against the *label*, not the dot. Comparing dot
  // positions let "Central Silk Board" and "HSR Layout" sit 30 units apart and
  // print straight through each other: a station name is around 60 units wide
  // at this size, so two dots can be well separated and their labels still
  // collide. Two labels is enough to orient a reader; the rest have hover
  // titles and are listed by name under the map.
  const LABEL_WIDTH = 62;
  const stations: typeof placed = [];
  for (const s of placed
    .filter((f) => f.kind === "metro_rail" && f.name)
    .sort((a, b) => a.km - b.km)) {
    if (stations.length >= 2) break;
    const clashes = stations.some(
      (t) => Math.abs(t.x - s.x) < LABEL_WIDTH && Math.abs(t.y - s.y) < 12,
    );
    if (!clashes) stations.push(s);
  }

  const counts = present.map(
    (k) => `${placed.filter((f) => f.kind === k).length} ${STYLE[k].label.toLowerCase()}`,
  );

  return (
    <figure className="mt-4">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full max-w-[380px] rounded-2xl border border-hairline bg-page-plane"
        role="img"
        aria-label={
          `Map of what is mapped around ${localityName}: ` + counts.join(", ") +
          `, within ${FRAME_RADIUS_KM} kilometres of the centre.`
        }
      >
        {/* Distance rings, so the picture carries a scale rather than just a
            shape. Labelled on one axis only — labelling all four is noise. */}
        {[1, 2, AMENITY_RADIUS_KM, FRAME_RADIUS_KM].map((km) => (
          <circle
            key={km}
            cx={CENTRE}
            cy={CENTRE}
            r={km * SCALE}
            fill="none"
            stroke="var(--color-gridline)"
            strokeWidth={km === AMENITY_RADIUS_KM ? 1.2 : 0.8}
            strokeDasharray={km === AMENITY_RADIUS_KM ? "none" : "3 3"}
          />
        ))}
        {/* Ring labels sit at the top of each ring and carry a halo of the page
            colour, drawn under the glyph. Without it they land on top of dots
            and neither is readable — the first version put them across the
            middle of the densest part of the map. */}
        {[1, 2, 3].map((km) => (
          <text
            key={km}
            x={CENTRE}
            y={CENTRE - km * SCALE + 2.5}
            textAnchor="middle"
            className="fill-[var(--color-ink-muted)]"
            style={{ fontSize: 7 }}
            stroke="var(--color-page-plane)"
            strokeWidth={2.5}
            paintOrder="stroke"
          >
            {km} km
          </text>
        ))}

        {DRAW_ORDER.map((kind) =>
          placed
            .filter((f) => f.kind === kind)
            .map((f, i) => (
              <circle
                key={`${kind}-${i}`}
                cx={f.x}
                cy={f.y}
                r={STYLE[kind].r}
                fill={STYLE[kind].fill}
                fillOpacity={kind === "industrial_sites" ? 0.55 : 0.85}
              >
                <title>{f.name || STYLE[kind].label}</title>
              </circle>
            )),
        )}

        {/* The locality centre. A ring rather than a dot, so it reads as "this
            is the point everything is measured from" rather than as one more
            feature among the others. */}
        <circle
          cx={CENTRE} cy={CENTRE} r={5.5}
          fill="var(--color-surface-1)"
          stroke="var(--color-ink-primary)" strokeWidth={2}
        />

        {stations.map((s, i) => (
          <text
            key={`label-${i}`}
            x={s.x}
            y={s.y - 7}
            textAnchor="middle"
            className="fill-[var(--color-ink-secondary)]"
            style={{ fontSize: 7.5, fontWeight: 600 }}
            stroke="var(--color-page-plane)"
            strokeWidth={2.5}
            paintOrder="stroke"
          >
            {s.name}
          </text>
        ))}
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {present.map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1.5 text-[10.5px] text-ink-secondary">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: STYLE[kind].fill }}
            />
            {STYLE[kind].label}
            <span className="text-ink-muted">
              {placed.filter((f) => f.kind === kind).length}
            </span>
          </span>
        ))}
      </figcaption>

      <p className="mt-2 text-[10.5px] leading-[1.5] text-ink-muted">
        Positions are as recorded in OpenStreetMap, measured from the centre of{" "}
        {localityName}. Not a street map — it shows only what we counted, so a
        blank area means nothing was mapped there rather than nothing is there.
      </p>
    </figure>
  );
}
