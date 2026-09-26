import { useEffect } from "react";
import { View, StyleSheet, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { radius, theme } from "@/src/theme";

/**
 * A shimmering placeholder block. It pulses opacity on the UI thread (opacity is
 * free to animate) and holds a steady dim under Reduce Motion. Used to sketch the
 * shape of content before it loads, instead of a lone spinner.
 */
export function Skeleton({ style }: { style?: ViewStyle | ViewStyle[] }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(reduced ? 0.6 : 1);

  useEffect(() => {
    if (!reduced) {
      opacity.set(
        withRepeat(
          withTiming(0.4, { duration: 850, easing: Easing.inOut(Easing.ease) }),
          -1,
          true,
        ),
      );
    }
  }, [reduced, opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return <Animated.View style={[styles.base, style, animated]} />;
}

/** A placeholder shaped like a LocalityRow, for list loading states. */
export function LocalityRowSkeleton() {
  return (
    <View style={styles.row}>
      <Skeleton style={{ width: 56, height: 56, borderRadius: 14 }} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton style={{ width: "55%", height: 15 }} />
        <Skeleton style={{ width: "32%", height: 12 }} />
        <Skeleton style={{ width: "72%", height: 11 }} />
      </View>
      <Skeleton style={{ width: 24, height: 20 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: theme.plane, borderRadius: radius.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.hairline,
    borderRadius: radius.lg,
    padding: 10,
    marginBottom: 10,
  },
});
