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
const MARGIN = 10;
const SCALE = (SIZE / 2 - MARGIN) / FRAME_RADIUS_KM;   // units per km, default frame

/**
 * The frame is fitted to the locality, not to the search radius.
 *
 * Drawing every map out to 3.5 km — the industrial search radius — meant most
 * of them were mostly empty. Sector 56's furthest feature is 2.50 km away, so
 * half the frame was blank rings, and the picture read as sparse when the
 * locality is not. Fitting to the data makes the same features around forty
 * per cent larger and fills the space they are given.
 *
 * A floor of 1.5 km stops a locality with two features from being drawn at
 * absurd magnification, which would imply a precision the centroid does not
 * have.
 */
function frameFor(maxKm: number): number {
  const rounded = Math.ceil(maxKm * 2) / 2;   // to the nearest half-kilometre
  return Math.min(FRAME_RADIUS_KM, Math.max(1.5, rounded));
}

type Kind = ConnectivityFeature["kind"];

// Ordered back-to-front: industrial land is drawn first so a hospital sitting
// on top of it stays visible, and the centre marker last so nothing hides it.
const DRAW_ORDER: Kind[] = [
  "industrial_sites", "parks", "markets", "clinics", "hospitals", "metro_rail",
];

/**
 * Six kinds, six distinguishable marks.
 *
 * The first palette reused the site's chart tokens and three of the six
 * collided. Hospitals and clinics were the *same* colour — `--color-series-blue`
 * for both, separated only by radius, which at legend size is no separation at
 * all. Supermarkets took `--color-series-violet` against that same blue, and
 * stations took `--color-brand-deep` against the parks green. A reader could
 * not tell a hospital from a clinic, and had to work to tell either from a
 * shop.
 *
 * Hue now separates every pair, and shape carries the two that matter most:
 * industrial land is a square because it is an area rather than a point and
 * because it is the one mark that counts against a locality, and a station is a
 * ringed dot because it is the single feature people most want to find. That
 * second channel is what keeps the map readable for the roughly one man in
 * twelve with red-green colour blindness, for whom the green and the orange are
 * the pair most at risk.
 *
 * These are literal values rather than tokens because they are a categorical
 * palette — chosen against each other, not against the site's semantic roles.
 * Parks keep the status green and industrial land the status orange, since
 * those two do carry the site's meaning of good and warning.
 */
const STYLE: Record<
  Kind,
  {
    fill: string; r: number; label: string;
    shape: "circle" | "square" | "ring" | "hollow";
    /** Shown in the legend, and on the map only where the kind is sparse.
     *
     * Not on every mark, and the reason is density rather than taste:
     * Koramangala places 219 features inside this frame. Two hundred emoji at
     * any legible size is a pile rather than a map, and they render differently
     * on Android, iOS and Windows, so the picture would differ for every
     * visitor. In the legend there are six of them and each is unmistakable —
     * which is exactly where an icon earns its place. */
    emoji: string;
  }
> = {
  industrial_sites: {
    fill: "var(--color-status-serious)", r: 4.2,
    label: "Industrial land", shape: "square", emoji: "🏭",
  },
  parks:     { fill: "var(--color-status-good)", r: 2.6, label: "Parks", shape: "circle" , emoji: "🌳"},
  // Magenta, pushed well away from the blues it used to sit beside.
  markets:   { fill: "#b5359c", r: 2.4, label: "Supermarkets", shape: "circle" , emoji: "🛒"},
  // Hollow, and teal rather than blue. Hospitals and clinics are the pair a
  // reader is most likely to confuse — they are the same category of thing and
  // they sat in the same colour — so they are separated twice over: a different
  // hue, and filled against outlined. Outlined also reads as the lighter of the
  // two, which is what a clinic is.
  clinics:   { fill: "#0d9aa8", r: 2.6, label: "Clinics", shape: "hollow" , emoji: "💊"},
  hospitals: { fill: "var(--color-series-blue)", r: 3.4, label: "Hospitals", shape: "circle" , emoji: "🏥"},
  // Near-black, and the only ringed mark: stations are what people look for
  // first, so they should be findable without consulting the legend.
  metro_rail: { fill: "#15243d", r: 4.0, label: "Stations", shape: "ring" , emoji: "🚇"},
};

export function project(
  lat: number, lon: number, centreLat: number, centreLon: number,
  /** Units per kilometre. Defaults to the full-radius frame; the component
   *  passes a tighter one when the locality's features do not reach that far. */
  scale: number = SCALE,
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
    x: Math.round((CENTRE + eastKm * scale) * 100) / 100,
    y: Math.round((CENTRE - northKm * scale) * 100) / 100,  // north must go up
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
  const withinFrame = features
    .map((f) => ({ ...f, ...project(f.lat, f.lon, lat, lon) }))
    .filter((f) => f.km <= FRAME_RADIUS_KM);

  if (withinFrame.length === 0) return null;

  // Measure first, then re-project at a scale that fits what was measured.
  const frameKm = frameFor(Math.max(...withinFrame.map((f) => f.km)));
  const scale = (SIZE / 2 - MARGIN) / frameKm;
  const placed = features
    .map((f) => ({ ...f, ...project(f.lat, f.lon, lat, lon, scale) }))
    .filter((f) => f.km <= frameKm);

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

  /**
   * Icons shrink as the locality fills up.
   *
   * Sector 56 places 52 features and Koramangala 219 in the same frame. One
   * size cannot serve both: what is comfortable at fifty overlaps into mush at
   * two hundred, and what is legible at two hundred is needlessly timid at
   * fifty. This is a gentle taper rather than a cliff, so two neighbouring
   * localities never look like they were drawn to different standards.
   */
  const density = Math.min(1, Math.max(0, (placed.length - 60) / 160));
  const iconScale = 2.7 - 0.9 * density;   // 2.7 when sparse, 1.8 when packed

  const counts = present.map(
    (k) => `${placed.filter((f) => f.kind === k).length} ${STYLE[k].label.toLowerCase()}`,
  );

  return (
    <figure className="mt-4">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full rounded-2xl border border-hairline bg-page-plane"
        role="img"
        aria-label={
          `Map of what is mapped around ${localityName}: ` + counts.join(", ") +
          `, within ${FRAME_RADIUS_KM} kilometres of the centre.`
        }
      >
        {/* Distance rings, so the picture carries a scale rather than just a
            shape. Labelled on one axis only — labelling all four is noise. */}
        {[1, 2, 3, AMENITY_RADIUS_KM, frameKm]
          .filter((km, i, all) => km <= frameKm && all.indexOf(km) === i)
          .map((km) => (
          <circle
            key={km}
            cx={CENTRE}
            cy={CENTRE}
            r={km * scale}
            fill="none"
            stroke="var(--color-gridline)"
            strokeWidth={km === AMENITY_RADIUS_KM ? 1.2 : 0.8}
            strokeDasharray={km === AMENITY_RADIUS_KM ? "none" : "3 3"}
          />
        ))}
        {DRAW_ORDER.map((kind) => {
          const style = STYLE[kind];
          return placed
            .filter((f) => f.kind === kind)
            .map((f, i) => (
              <text
                key={`${kind}-${i}`}
                x={f.x}
                y={f.y}
                textAnchor="middle"
                dominantBaseline="central"
                style={{ fontSize: style.r * iconScale }}
              >
                {style.emoji}
                <title>{f.name || style.label}</title>
              </text>
            ));
        })}

        {/* Ring labels, drawn after the features rather than before.
          *
          * They carry a halo of the page colour under the glyph, which is
          * enough to lift them off the rings — but not off ninety dots.
          * Koramangala buried the "1 km" label under its own density, and a
          * scale nobody can read is the same as no scale. Drawn last they stay
          * legible, and at seven pixels they hide almost nothing. */}
        {[1, 2, 3].filter((km) => km < frameKm).map((km) => (
          <text
            key={km}
            x={CENTRE}
            y={CENTRE - km * scale + 2.5}
            textAnchor="middle"
            className="fill-[var(--color-ink-muted)]"
            style={{ fontSize: 7 }}
            stroke="var(--color-page-plane)"
            strokeWidth={3}
            paintOrder="stroke"
          >
            {km} km
          </text>
        ))}

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
            {/* The swatch carries the shape as well as the colour. A legend of
              * identical dots is exactly how hospitals and clinics came to be
              * indistinguishable: same swatch, same hue, and the only
              * difference — a millimetre of radius on the map — invisible
              * here. */}
            {/* The icon alone. It used to sit beside a colour chip, which
              * made sense while the map drew coloured shapes — now that the
              * map draws these same icons, the chip described nothing that was
              * on it. */}
            <span aria-hidden="true" className="text-[13px] leading-none">
              {STYLE[kind].emoji}
            </span>
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
