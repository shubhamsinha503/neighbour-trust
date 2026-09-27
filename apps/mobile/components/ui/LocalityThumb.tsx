import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View, type ViewStyle } from "react-native";

import { coverImage } from "@/src/coverImage";

// Deterministic on-brand gradient placeholder shown under the photo while it
// loads (and if it ever fails) — keeps cards looking intentional, never blank.
const PAIRS: Array<[string, string]> = [
  ["#F72575", "#B3175A"],
  ["#10213A", "#33507A"],
  ["#7C3AED", "#4C1D95"],
  ["#2563EB", "#1E3A8A"],
  ["#1B9362", "#0F5C3E"],
  ["#EA580C", "#9A3412"],
];

function pick(seed: string): [string, string] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PAIRS[h % PAIRS.length];
}

/**
 * A locality cover: representative photography (deterministic per slug) over a
 * brand gradient placeholder, with a soft dark scrim at the bottom so any text
 * overlaid on it stays legible. `width` sizes the fetched image.
 */
export function LocalityThumb({
  seed,
  style,
  radius = 16,
  width = 600,
  scrim = false,
}: {
  seed: string;
  label?: string;
  style?: ViewStyle | ViewStyle[];
  radius?: number;
  width?: number;
  scrim?: boolean;
}) {
  const [a, b] = pick(seed);
  return (
    <View style={[{ borderRadius: radius, overflow: "hidden", backgroundColor: a }, style]}>
      <LinearGradient colors={[a, b]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Image
        source={{ uri: coverImage(seed, width) }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={280}
        cachePolicy="memory-disk"
      />
      {scrim && (
        <LinearGradient
          colors={["transparent", "rgba(16,33,58,0.55)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
    </View>
  );
}
