import { View, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { Txt } from "@/components/ui/Txt";
import { font, scoreColor, theme } from "@/src/theme";

type Size = "sm" | "md" | "lg";

const DIMS: Record<Size, { box: number; stroke: number; num: number }> = {
  sm: { box: 40, stroke: 4, num: 15 },
  md: { box: 64, stroke: 6, num: 22 },
  lg: { box: 96, stroke: 8, num: 34 },
};

interface Props {
  score: number | null;
  size?: Size;
}

/**
 * A circular trust-score badge: a coloured progress ring (fill proportional to
 * the score, colour by band) around the number. Null scores render an empty grey
 * ring with an em dash, matching the report's "no data yet" state.
 */
export function ScoreBadge({ score, size = "md" }: Props) {
  const { box, stroke, num } = DIMS[size];
  const r = (box - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const color = scoreColor(score);

  return (
    <View style={{ width: box, height: box }}>
      <Svg width={box} height={box}>
        <Circle
          cx={box / 2}
          cy={box / 2}
          r={r}
          stroke={theme.hairline}
          strokeWidth={stroke}
          fill="none"
        />
        {score !== null && (
          <Circle
            cx={box / 2}
            cy={box / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c}`}
            transform={`rotate(-90 ${box / 2} ${box / 2})`}
          />
        )}
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Txt
          style={{ fontFamily: font.extrabold, fontSize: num, color }}
        >
          {score ?? "—"}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
