import { useEffect } from "react";
import { View, StyleSheet, TextInput } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { Txt } from "@/components/ui/Txt";
import { font, scoreColor, theme } from "@/src/theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

type Size = "sm" | "md" | "lg";

const DIMS: Record<Size, { box: number; stroke: number; num: number }> = {
  sm: { box: 40, stroke: 4, num: 15 },
  md: { box: 64, stroke: 6, num: 22 },
  lg: { box: 96, stroke: 8, num: 34 },
};

interface Props {
  score: number | null;
  size?: Size;
  /** Show a small "/100" under the number (used on the overview hero ring). */
  showOutOf?: boolean;
  /** Fill the ring up to the score on mount (for hero rings, not list badges). */
  animate?: boolean;
}

/**
 * A circular trust-score badge: a coloured progress ring (fill proportional to
 * the score, colour by band) around the number. Null scores render an empty grey
 * ring with an em dash. When `animate` is set the ring sweeps up to the score on
 * mount — a "state indication" beat reserved for the hero rings, off in lists so
 * scrolling never re-triggers it, and skipped under Reduce Motion.
 */
export function ScoreBadge({ score, size = "md", showOutOf = false, animate = false }: Props) {
  const { box, stroke, num } = DIMS[size];
  const r = (box - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const color = scoreColor(score);
  const reduced = useReducedMotion();

  const shouldAnimate = animate && !reduced && score !== null;
  const progress = useSharedValue(shouldAnimate ? 0 : pct);

  useEffect(() => {
    if (shouldAnimate) progress.set(withTiming(pct, { duration: 750, easing: EASE_OUT }));
    else progress.set(pct);
  }, [pct, shouldAnimate, progress]);

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: c * (1 - progress.get()),
  }));

  // Count the number up alongside the ring (reference: "score counts up").
  const target = score ?? 0;
  const numberProps = useAnimatedProps(
    () => ({ text: String(Math.round(progress.get() * target)) }) as never,
  );

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
          <AnimatedCircle
            cx={box / 2}
            cy={box / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            animatedProps={ringProps}
            transform={`rotate(-90 ${box / 2} ${box / 2})`}
          />
        )}
      </Svg>
      <View style={styles.center} pointerEvents="none">
        {shouldAnimate ? (
          <AnimatedTextInput
            editable={false}
            defaultValue={String(score ?? 0)}
            animatedProps={numberProps}
            style={{
              fontFamily: font.extrabold,
              fontSize: num,
              color,
              padding: 0,
              margin: 0,
              includeFontPadding: false,
              textAlign: "center",
              minWidth: num * 2,
            }}
          />
        ) : (
          <Txt style={{ fontFamily: font.extrabold, fontSize: num, color, lineHeight: num * 1.05 }}>
            {score ?? "—"}
          </Txt>
        )}
        {showOutOf && score !== null && (
          <Txt style={{ fontFamily: font.semibold, fontSize: num * 0.32, color: theme.inkMuted }}>
            /100
          </Txt>
        )}
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
