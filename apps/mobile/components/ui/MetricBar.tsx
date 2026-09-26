import { View, StyleSheet } from "react-native";

import { radius, theme } from "@/src/theme";

/**
 * A slim horizontal score bar (the web prototype's metric bar): a grey track with
 * a band-coloured fill proportional to the 0–100 score. A visual complement to
 * the number, so a category's standing reads at a glance.
 */
export function MetricBar({ value, color }: { value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: theme.plane,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: radius.pill },
});
