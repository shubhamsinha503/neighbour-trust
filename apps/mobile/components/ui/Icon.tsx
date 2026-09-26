import Svg, { Path, Circle, Polyline } from "react-native-svg";

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
  | "globe";

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  /** Filled bookmark for the "saved" active state. */
  filled?: boolean;
}

/**
 * A tiny stroke-icon set (feather-style) drawn with react-native-svg so the app
 * needs no icon-font dependency. Only the handful of glyphs the UI actually uses.
 */
export function Icon({ name, size = 24, color = theme.inkMuted, filled = false }: Props) {
  const stroke = color;
  const sw = 2;
  const common = {
    stroke,
    strokeWidth: sw,
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
        <Path
          d="M6 3h12v18l-6-4-6 4V3Z"
          {...common}
          fill={filled ? color : "none"}
        />
      )}
      {name === "menu" && (
        <>
          <Path d="M4 7h16M4 12h16M4 17h16" {...common} />
        </>
      )}
      {name === "location" && (
        <>
          <Path d="M12 21s-7-6.5-7-11a7 7 0 1 1 14 0c0 4.5-7 11-7 11Z" {...common} />
          <Circle cx={12} cy={10} r={2.5} {...common} />
        </>
      )}
      {name === "chevron" && <Polyline points="9 6 15 12 9 18" {...common} />}
      {name === "back" && <Polyline points="15 6 9 12 15 18" {...common} />}
      {name === "globe" && (
        <>
          <Circle cx={12} cy={12} r={9} {...common} />
          <Path d="M3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18" {...common} />
        </>
      )}
    </Svg>
  );
}
