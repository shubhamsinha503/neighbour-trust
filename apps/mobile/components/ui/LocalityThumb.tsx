import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View, type ViewStyle } from "react-native";

import { Txt } from "@/components/ui/Txt";
import { font } from "@/src/theme";

// On-brand gradient pairs; picked deterministically per locality so cards have
// variety without fake photography. Purely decorative, never claimed as imagery
// of the actual place.
const PAIRS: Array<[string, string]> = [
  ["#F72575", "#FF7BAC"],
  ["#10213A", "#33507A"],
  ["#7C3AED", "#B794F6"],
  ["#2563EB", "#6BA3F7"],
  ["#1B9362", "#54C79A"],
  ["#EA580C", "#FBA46A"],
];

function pick(seed: string): [string, string] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PAIRS[h % PAIRS.length];
}

/**
 * A decorative gradient tile standing in for locality imagery (we have no photos
 * of specific places, and inventing them would be dishonest). Deterministic by
 * slug, with the locality's initial watermarked in.
 */
export function LocalityThumb({
  seed,
  label,
  style,
  radius = 16,
}: {
  seed: string;
  label: string;
  style?: ViewStyle | ViewStyle[];
  radius?: number;
}) {
  const [a, b] = pick(seed);
  return (
    <LinearGradient
      colors={[a, b]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[{ borderRadius: radius, overflow: "hidden" }, style]}
    >
      <View style={styles.fill}>
        <Txt style={styles.letter}>{label.trim().charAt(0).toUpperCase()}</Txt>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: "center", justifyContent: "center" },
  letter: { fontFamily: font.extrabold, fontSize: 40, color: "rgba(255,255,255,0.28)" },
});
