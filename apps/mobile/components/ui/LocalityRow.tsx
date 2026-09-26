import { Link } from "expo-router";
import { Pressable, View, StyleSheet } from "react-native";

import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { Txt } from "@/components/ui/Txt";
import { useI18n } from "@/src/i18n";
import type { LocalitySummary } from "@/src/api";
import { theme } from "@/src/theme";

/**
 * One tappable locality in a list: name + city on the left, a small score badge
 * on the right, and a sub-line telling the buyer how much of the picture we have
 * documented — the app's honesty signal, front and centre.
 */
export function LocalityRow({ item }: { item: LocalitySummary }) {
  const { t } = useI18n();
  const documented = item.categories_with_data;

  return (
    <Link href={`/${item.slug}`} asChild>
      <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <View style={styles.text}>
          <Txt weight="bold" style={styles.name} numberOfLines={1}>
            {item.name}
          </Txt>
          <Txt style={styles.city} numberOfLines={1}>
            {item.city}
          </Txt>
          <Txt weight="medium" style={styles.meta}>
            {documented > 0
              ? `${documented} ${t("home.documented")}`
              : t("common.noDataYet")}
          </Txt>
        </View>
        <ScoreBadge score={item.score} size="sm" />
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.hairline,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
  },
  pressed: { backgroundColor: theme.plane },
  text: { flex: 1, gap: 2 },
  name: { fontSize: 16, color: theme.ink },
  city: { fontSize: 13, color: theme.inkMuted },
  meta: { fontSize: 11, color: theme.brandDeep, marginTop: 2 },
});
