import { Link } from "expo-router";
import { StyleSheet, View } from "react-native";

import { LocalityThumb } from "@/components/ui/LocalityThumb";
import { PressableScale } from "@/components/ui/PressableScale";
import { Txt } from "@/components/ui/Txt";
import type { LocalitySummary } from "@/src/api";
import { radius, scoreColor, shadow, theme } from "@/src/theme";

/**
 * A compact locality card for the horizontal "Popular near you" rail: a gradient
 * cover with the score pill, then name and city. Taps through to the report.
 */
export function LocalityCard({ item }: { item: LocalitySummary }) {
  return (
    <Link href={`/${item.slug}`} asChild>
      <PressableScale style={styles.card}>
        <View style={styles.coverWrap}>
          <LocalityThumb seed={item.slug} label={item.name} style={styles.cover} radius={0} />
          <View style={styles.pill}>
            <Txt weight="extrabold" style={[styles.pillText, { color: scoreColor(item.score) }]}>
              {item.score ?? "—"}
            </Txt>
          </View>
        </View>
        <View style={styles.body}>
          <Txt weight="bold" style={styles.name} numberOfLines={1}>
            {item.name}
          </Txt>
          <Txt style={styles.city} numberOfLines={1}>
            {item.city}
          </Txt>
        </View>
      </PressableScale>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 168,
    backgroundColor: theme.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.hairline,
    overflow: "hidden",
    ...shadow.card,
  },
  coverWrap: { height: 96 },
  cover: { flex: 1 },
  pill: {
    position: "absolute",
    right: 8,
    bottom: 8,
    backgroundColor: theme.surface,
    borderRadius: radius.pill,
    minWidth: 34,
    height: 30,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
  },
  pillText: { fontSize: 15 },
  body: { padding: 12 },
  name: { fontSize: 15, color: theme.ink },
  city: { fontSize: 12, color: theme.inkMuted, marginTop: 2 },
});
