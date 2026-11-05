/**
 * Inline SVG icon set for the web app, mirroring the glyph names the mobile app
 * uses (apps/mobile/components/ui/Icon) so the two products read as one. Stroke
 * icons at 24×24; `filled` swaps to a solid heart for the brand mark.
 */
import type { CSSProperties } from "react";

export type IconName =
  | "heart"
  | "search"
  | "location"
  | "arrowRight"
  | "shield"
  | "leaf"
  | "drop"
  | "bus"
  | "book"
  | "plus"
  | "tree"
  | "sun";

const PATHS: Record<IconName, { d: string; fill?: boolean }[]> = {
  heart: [{ d: "M12 20.5 4.5 13A4.6 4.6 0 0 1 12 7.8 4.6 4.6 0 0 1 19.5 13Z", fill: true }],
  search: [{ d: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z" }, { d: "m20 20-3.5-3.5" }],
  location: [{ d: "M12 3v2m0 14v2m9-9h-2M5 12H3" }, { d: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" }],
  arrowRight: [{ d: "M5 12h14m-6-6 6 6-6 6" }],
  shield: [{ d: "M12 3 5 6v5c0 4.3 3 7.3 7 9 4-1.7 7-4.7 7-9V6Z" }, { d: "m9 12 2 2 4-4" }],
  leaf: [{ d: "M4 20C3 14 6 5 20 4c1 11-5 15-12 15-2 0-4 .5-4-.5Z" }, { d: "M9 15c3-3 6-4 9-4" }],
  drop: [{ d: "M12 3c3 4 6 7 6 10.5A6 6 0 0 1 6 13.5C6 10 9 7 12 3Z" }],
  bus: [{ d: "M6 4h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" }, { d: "M4 10h16M8 17v2m8-2v2" }, { d: "M8.5 13.5h.01m6.99 0h.01", fill: true }],
  book: [{ d: "M5 4h10a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2Z" }, { d: "M17 20a2 2 0 0 0 2-2V6" }, { d: "M9 8h5M9 12h5" }],
  plus: [{ d: "M12 6v12M6 12h12" }],
  tree: [{ d: "M12 3c3 0 5 2.5 5 5.5 0 .9-.2 1.7-.6 2.4A4.5 4.5 0 0 1 14 20h-4a4.5 4.5 0 0 1-2.4-9.1A5.3 5.3 0 0 1 7 8.5C7 5.5 9 3 12 3Z" }, { d: "M12 14v7" }],
  sun: [{ d: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" }, { d: "M12 2v2m0 16v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M2 12h2m16 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" }],
};

export function Icon({
  name,
  size = 20,
  color = "currentColor",
  filled = false,
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  filled?: boolean;
  style?: CSSProperties;
}) {
  const parts = PATHS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      {parts.map((p, i) => (
        <path
          key={i}
          d={p.d}
          fill={filled || p.fill ? color : "none"}
          stroke={filled && p.fill ? "none" : color}
        />
      ))}
    </svg>
  );
}
