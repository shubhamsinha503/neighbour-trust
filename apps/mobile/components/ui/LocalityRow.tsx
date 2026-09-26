import { Link } from "expo-router";
import { Pressable, View, StyleSheet } from "react-native";

import { Icon } from "@/components/ui/Icon";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { Txt } from "@/components/ui/Txt";
import { useI18n } from "@/src/i18n";
import type { LocalitySummary } from "@/src/api";
import { theme } from "@/src/theme";

/**
 * One tappable locality in a list: a score-ring badge on the left, the name and
 * city, and — when the locality has one — its single most important flag on a
 * coloured line, which is the honesty signal a buyer scans for. Falls back to how
 * much of the picture is documented when there is no flag.
 */
export function LocalityRow({ item }: { item: LocalitySummary }) {
  const { t } = useI18n();
  const flag = item.top_flag;
  const flagColor = flag?.severity === "serious" ? theme.bad : theme.warn;

  return (
    <Link href={`/${item.slug}`} asChild>
      <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <ScoreBadge score={item.score} size="sm" />
        <View style={styles.text}>
          <Txt weight="bold" style={styles.name} numberOfLines={1}>
            {item.name}
          </Txt>
          <Txt style={styles.city} numberOfLines={1}>
            {item.city}
          </Txt>
          {flag ? (
            <View style={styles.flagLine}>
              <View style={[styles.dot, { backgroundColor: flagColor }]} />
              <Txt weight="medium" style={styles.flagText} numberOfLines={1}>
                {flag.headline}
              </Txt>
            </View>
          ) : (
            <Txt weight="medium" style={styles.meta}>
              {item.categories_with_data > 0
                ? `${item.categories_with_data} ${t("home.documented")}`
                : t("common.noDataYet")}
            </Txt>
          )}
        </View>
        <Icon name="chevron" size={18} color={theme.inkMuted} />
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
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
  },
  pressed: { backgroundColor: theme.plane },
  text: { flex: 1, gap: 2 },
  name: { fontSize: 16, color: theme.ink },
  city: { fontSize: 13, color: theme.inkMuted },
  flagLine: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 999 },
  flagText: { flex: 1, fontSize: 11.5, color: theme.inkSecondary },
  meta: { fontSize: 11, color: theme.brandDeep, marginTop: 2 },
});
