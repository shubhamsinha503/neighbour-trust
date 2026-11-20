// Scroll driver for the homepage opening. Ported from the standalone build
// (lib/opening/*). It writes plain numbers onto the host section and moves three
// kinds of thing — the camera (the SVG viewBox), the train and the cars — and CSS
// does everything else. Kept free of React so the same logic can drive any host.

type Pt = [number, number];

const HX = 32; // half a tile's width on screen
const HY = 16; // half a tile's height on screen
function iso(gx: number, gy: number, z = 0): Pt {
  return [(gx - gy) * HX, (gx + gy) * HY - z];
}

/** The signals, in the order the place gives them up, with their arrival point. */
const SIGNALS = [
  { k: "metro", at: 0.15 },
  { k: "school", at: 0.215 },
  { k: "green", at: 0.28 },
  { k: "air", at: 0.345 },
  { k: "ppl", at: 0.41 },
  { k: "dark", at: 0.475 },
  { k: "water", at: 0.54 },
] as const;

// Camera keyframes: a centre point, and a named point the camera visits for each
// signal (used on phones, where the frame travels to each thing in turn).
const C: Pt = [0, 235];
const AT = {
  metro: iso(10.5, 6.5, 46),
  school: iso(4.5, 9.4, 14),
  green: iso(8.5, 9.5, 0),
  air: iso(7, 0.4, 30),
  ppl: iso(10.5, 4.5, 50),
  dark: iso(2.6, 11.2, 0),
  water: iso(3, 12.4, 0),
};
const mixPt = (a: Pt, b: Pt, k: number): Pt => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];

type Key = { p: number; f: Pt; w: number; a: Pt };
const CAM: { desk: Key[]; phone: Key[] } = {
  desk: [
    { p: 0, f: C, w: 1480, a: [0.6, 0.57] },
    { p: 0.12, f: C, w: 1200, a: [0.58, 0.54] },
    { p: 0.19, f: mixPt(C, AT.metro, 0.35), w: 1040, a: [0.57, 0.53] },
    { p: 0.255, f: mixPt(C, AT.school, 0.35), w: 1020, a: [0.57, 0.53] },
    { p: 0.32, f: mixPt(C, AT.green, 0.35), w: 1020, a: [0.57, 0.53] },
    { p: 0.385, f: mixPt(C, AT.air, 0.35), w: 1060, a: [0.57, 0.53] },
    { p: 0.45, f: mixPt(C, AT.ppl, 0.3), w: 1080, a: [0.57, 0.53] },
    { p: 0.515, f: mixPt(C, AT.dark, 0.35), w: 1040, a: [0.57, 0.53] },
    { p: 0.58, f: mixPt(C, AT.water, 0.35), w: 1040, a: [0.57, 0.53] },
    { p: 0.64, f: C, w: 1130, a: [0.6, 0.54] },
    { p: 0.84, f: C, w: 1070, a: [0.6, 0.54] },
    // The diorama takes the left of the frame; the hand-over takes the right.
    { p: 0.95, f: C, w: 1400, a: [0.26, 0.52] },
    { p: 1, f: C, w: 1400, a: [0.26, 0.52] },
  ],
  phone: [
    { p: 0, f: C, w: 860, a: [0.5, 0.6] },
    { p: 0.12, f: C, w: 820, a: [0.5, 0.52] },
    { p: 0.19, f: AT.metro, w: 420, a: [0.5, 0.47] },
    { p: 0.255, f: AT.school, w: 420, a: [0.5, 0.47] },
    { p: 0.32, f: AT.green, w: 440, a: [0.5, 0.47] },
    { p: 0.385, f: AT.air, w: 470, a: [0.5, 0.47] },
    { p: 0.45, f: AT.ppl, w: 480, a: [0.5, 0.47] },
    { p: 0.515, f: AT.dark, w: 420, a: [0.5, 0.47] },
    { p: 0.58, f: AT.water, w: 420, a: [0.5, 0.47] },
    // The whole place again, filling the phone edge to edge.
    { p: 0.64, f: C, w: 700, a: [0.5, 0.52] },
    { p: 0.84, f: C, w: 700, a: [0.5, 0.52] },
    // Words above, field below: the morning diorama sits between them.
    { p: 0.95, f: C, w: 860, a: [0.5, 0.6] },
    { p: 1, f: C, w: 860, a: [0.5, 0.6] },
  ],
};

/** Smoothstep over [a, b] — eased and clamped. */
function win(p: number, a: number, b: number): number {
  const t = Math.min(1, Math.max(0, (p - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function camera(keys: Key[], p: number) {
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1].p) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const k = win(p, a.p, b.p);
  const lerp = (x: number, y: number) => x + (y - x) * k;
  return {
    fx: lerp(a.f[0], b.f[0]),
    fy: lerp(a.f[1], b.f[1]),
    // Zoom moves in log space, so pushing in reads as a steady dolly.
    w: Math.exp(lerp(Math.log(a.w), Math.log(b.w))),
    ax: lerp(a.a[0], b.a[0]),
    ay: lerp(a.a[1], b.a[1]),
  };
}

function paintOpening(host: HTMLElement, p: number) {
  const set = (k: string, v: number) => host.style.setProperty(k, v.toFixed(4));
  set("--p", p);
  // What you see: a sunny afternoon, the question, then dusk.
  set("--q", 1 - win(p, 0.075, 0.13));
  set("--look", win(p, 0.1, 0.13) - win(p, 0.16, 0.2));
  // Night falls through the reveal and lifts for the answer.
  const n = win(p, 0.1, 0.42) - win(p, 0.85, 0.97);
  set("--n", n);
  // Dusk and dawn: strongest halfway between day and night, either way.
  set("--dk", 4 * n * (1 - n));
  // What you don't see: each signal, and its one-word caption.
  for (const s of SIGNALS) {
    set(`--${s.k}`, win(p, s.at, s.at + 0.08));
    set(`--cap-${s.k}`, win(p, s.at, s.at + 0.02) - win(p, s.at + 0.055, s.at + 0.07));
  }
  // What matters to you: the same night re-lit for a student, a business, then a
  // family — and the family reading carries into the answer.
  set("--same", win(p, 0.62, 0.65) - win(p, 0.84, 0.87));
  set("--ls", win(p, 0.62, 0.66) - win(p, 0.69, 0.72));
  set("--lb", win(p, 0.69, 0.72) - win(p, 0.76, 0.79));
  set("--lf", win(p, 0.76, 0.79));
  // Nestra's answer.
  set("--res", win(p, 0.86, 0.95));
  host.dataset.stage = String(p < 0.13 ? 0 : p < 0.62 ? 1 : p < 0.85 ? 2 : 3);
}

/**
 * Drives the opening from the scroll position. Returns a cleanup that removes
 * every listener and cancels any pending frame.
 */
export function mountOpening(host: HTMLElement): () => void {
  const svg = host.querySelector("svg.op-svg") as SVGSVGElement | null;
  const train = host.querySelector("#op-train") as SVGGElement | null;
  const cars = Array.from(host.querySelectorAll(".op-car")) as SVGGElement[];
  if (!svg) return () => {};

  const frame = (p: number) => {
    const phone = window.innerWidth < 820;
    const c = camera(phone ? CAM.phone : CAM.desk, p);
    const aspect = Math.max(0.3, svg.clientWidth / Math.max(1, svg.clientHeight));
    const h = c.w / aspect;
    svg.setAttribute(
      "viewBox",
      `${(c.fx - c.ax * c.w).toFixed(1)} ${(c.fy - c.ay * h).toFixed(1)} ${c.w.toFixed(1)} ${h.toFixed(1)}`,
    );
    // The train runs the length of the line; the cars run the busy road.
    // One tile along the line is (−32, +16) on screen; along the road (32, 16).
    if (train) {
      const g = -4 + ((p * 70) % 20);
      train.setAttribute("transform", `translate(${(-32 * g).toFixed(1)} ${(16 * g).toFixed(1)})`);
    }
    for (const car of cars) {
      const o = Number(car.dataset.o);
      const dir = Number(car.dataset.dir);
      let g = (o + p * 46) % 16;
      if (dir < 0) g = 15 - g;
      g -= 1;
      car.setAttribute("transform", `translate(${(32 * g).toFixed(1)} ${(16 * g).toFixed(1)})`);
    }
  };

  const draw = (p: number) => {
    paintOpening(host, p);
    frame(p);
  };

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    // The finished frame, held still.
    draw(1);
    for (const s of SIGNALS) host.style.setProperty(`--${s.k}`, "1");
    const onResize = () => frame(1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }

  let raf = 0;
  const read = () => {
    raf = 0;
    const span = host.offsetHeight - window.innerHeight;
    if (span <= 0) return;
    draw(Math.min(1, Math.max(0, -host.getBoundingClientRect().top / span)));
  };
  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(read);
  };
  read();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  return () => {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
  };
}
