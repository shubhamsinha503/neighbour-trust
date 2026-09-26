import Svg, { Path, Circle, Polyline, Rect } from "react-native-svg";

import { theme } from "@/src/theme";

export type IconName =
  | "home"
  | "search"
  | "map"
  | "bookmark"
  | "menu"
  | "location"
  | "chevron"
  | "back"
  | "globe"
  | "heart"
  | "share"
  | "warning"
  | "info"
  | "arrowRight"
  | "building"
  // category glyphs
  | "book"
  | "shield"
  | "leaf"
  | "drop"
  | "bus"
  // amenity glyphs
  | "hospital"
  | "tree"
  | "cart"
  | "train";

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  /** Filled variant for bookmark / heart active states. */
  filled?: boolean;
}

/**
 * A tiny stroke-icon set (feather-style) drawn with react-native-svg so the app
 * needs no icon-font dependency. Only the glyphs the UI actually uses.
 */
export function Icon({ name, size = 24, color = theme.inkMuted, filled = false }: Props) {
  const stroke = color;
  const common = {
    stroke,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none",
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "home" && (
        <>
          <Path d="M3 10.5 12 3l9 7.5" {...common} />
          <Path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" {...common} />
          <Path d="M9.5 21v-6h5v6" {...common} />
        </>
      )}
      {name === "search" && (
        <>
          <Circle cx={11} cy={11} r={7} {...common} />
          <Path d="m20 20-3.5-3.5" {...common} />
        </>
      )}
      {name === "map" && (
        <>
          <Path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" {...common} />
          <Path d="M9 4v14M15 6v14" {...common} />
        </>
      )}
      {name === "bookmark" && (
        <Path d="M6 3h12v18l-6-4-6 4V3Z" {...common} fill={filled ? color : "none"} />
      )}
      {name === "heart" && (
        <Path
          d="M12 20s-7-4.4-9.2-8.2C1.3 8.9 2.6 5.5 5.8 5.1 7.8 4.8 9.4 6 12 8.6c2.6-2.6 4.2-3.8 6.2-3.5 3.2.4 4.5 3.8 3 6.7C19 15.6 12 20 12 20Z"
          {...common}
          fill={filled ? color : "none"}
        />
      )}
      {name === "share" && (
        <>
          <Circle cx={18} cy={5} r={2.5} {...common} />
          <Circle cx={6} cy={12} r={2.5} {...common} />
          <Circle cx={18} cy={19} r={2.5} {...common} />
          <Path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" {...common} />
        </>
      )}
      {name === "warning" && (
        <>
          <Path d="M12 3.5 22 20H2L12 3.5Z" {...common} />
          <Path d="M12 10v4.5" {...common} />
          <Circle cx={12} cy={17.5} r={0.6} fill={stroke} stroke={stroke} />
        </>
      )}
      {name === "info" && (
        <>
          <Circle cx={12} cy={12} r={9} {...common} />
          <Path d="M12 11v5" {...common} />
          <Circle cx={12} cy={7.7} r={0.6} fill={stroke} stroke={stroke} />
        </>
      )}
      {name === "menu" && <Path d="M4 7h16M4 12h16M4 17h16" {...common} />}
      {name === "location" && (
        <>
          <Path d="M12 21s-7-6.5-7-11a7 7 0 1 1 14 0c0 4.5-7 11-7 11Z" {...common} />
          <Circle cx={12} cy={10} r={2.5} {...common} />
        </>
      )}
      {name === "chevron" && <Polyline points="9 6 15 12 9 18" {...common} />}
      {name === "back" && <Polyline points="15 6 9 12 15 18" {...common} />}
      {name === "arrowRight" && (
        <>
          <Path d="M4 12h15" {...common} />
          <Polyline points="13 6 19 12 13 18" {...common} />
        </>
      )}
      {name === "globe" && (
        <>
          <Circle cx={12} cy={12} r={9} {...common} />
          <Path d="M3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18" {...common} />
        </>
      )}
      {name === "building" && (
        <>
          <Rect x={5} y={3} width={14} height={18} rx={1.5} {...common} />
          <Path d="M9 7h1.5M13.5 7H15M9 11h1.5M13.5 11H15M9 15h1.5M13.5 15H15M10.5 21v-3h3v3" {...common} />
        </>
      )}
      {name === "book" && (
        <>
          <Path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H18a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2V4.5Z" {...common} />
          <Path d="M4 19.5A2 2 0 0 1 6 18h13" {...common} />
        </>
      )}
      {name === "shield" && (
        <>
          <Path d="M12 3 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" {...common} />
          <Polyline points="9 12 11 14 15 9.5" {...common} />
        </>
      )}
      {name === "leaf" && (
        <>
          <Path d="M20 4C10 4 4 9 4 17c0 1.5.5 3 .5 3S9 20 13 18c5-2.5 7-8 7-14Z" {...common} />
          <Path d="M4.5 20C7 15 11 11 17 8" {...common} />
        </>
      )}
      {name === "drop" && (
        <Path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" {...common} />
      )}
      {name === "bus" && (
        <>
          <Rect x={4} y={4} width={16} height={13} rx={2} {...common} />
          <Path d="M4 11h16M8 4v7M16 4v7" {...common} />
          <Path d="M7 17v2.5M17 17v2.5" {...common} />
        </>
      )}
      {name === "hospital" && (
        <>
          <Rect x={4} y={4} width={16} height={16} rx={2} {...common} />
          <Path d="M12 8v8M8 12h8" {...common} />
        </>
      )}
      {name === "tree" && (
        <>
          <Path d="M12 3c3 0 5 2.4 5 5.2 0 1-.3 1.9-.8 2.6C17.4 11.7 18 13 18 14.2c0 2.4-2.7 3.8-6 3.8s-6-1.4-6-3.8c0-1.2.6-2.5 1.8-3.4-.5-.7-.8-1.6-.8-2.6C7 5.4 9 3 12 3Z" {...common} />
          <Path d="M12 18v3" {...common} />
        </>
      )}
      {name === "cart" && (
        <>
          <Path d="M3 4h2l2.2 11.2a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.8L20 7H6" {...common} />
          <Circle cx={9} cy={20} r={1.2} {...common} />
          <Circle cx={17} cy={20} r={1.2} {...common} />
        </>
      )}
      {name === "train" && (
        <>
          <Rect x={6} y={3} width={12} height={14} rx={3} {...common} />
          <Path d="M6 11h12M10 7h4" {...common} />
          <Path d="M8 21l1.5-2M16 21l-1.5-2" {...common} />
          <Circle cx={9.5} cy={14} r={0.6} fill={stroke} stroke={stroke} />
          <Circle cx={14.5} cy={14} r={0.6} fill={stroke} stroke={stroke} />
        </>
      )}
    </Svg>
  );
}
