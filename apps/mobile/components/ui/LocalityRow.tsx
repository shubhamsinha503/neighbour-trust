import { Link } from "expo-router";
import { View, StyleSheet } from "react-native";

import { Icon } from "@/components/ui/Icon";
import { LocalityThumb } from "@/components/ui/LocalityThumb";
import { PressableScale } from "@/components/ui/PressableScale";
import { Txt } from "@/components/ui/Txt";
import { useI18n } from "@/src/i18n";
import type { LocalitySummary } from "@/src/api";
import { radius, scoreColor, theme } from "@/src/theme";

/**
 * One tappable locality in a list: a gradient cover thumb, the name and city, the
 * locality's top flag on a severity-coloured line (from the summary's top_flag),
 * and the score on the right. The flag is the honesty signal a buyer scans for;
 * it falls back to how much of the picture is documented.
 */
export function LocalityRow({ item }: { item: LocalitySummary }) {
  const { t } = useI18n();
  const flag = item.top_flag;
  const flagColor = flag?.severity === "serious" ? theme.bad : theme.warn;

  return (
    <Link href={`/${item.slug}`} asChild>
      <PressableScale>
        <View style={styles.row}>
          <LocalityThumb seed={item.slug} label={item.name} style={styles.thumb} radius={14} />
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
          <View style={styles.right}>
            <Txt weight="extrabold" style={[styles.score, { color: scoreColor(item.score) }]}>
              {item.score ?? "—"}
            </Txt>
            <Icon name="chevron" size={16} color={theme.inkMuted} />
          </View>
        </View>
      </PressableScale>
    </Link>
  );
}

const styles = StyleSheet.create({
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
  thumb: { width: 56, height: 56 },
  text: { flex: 1, gap: 2 },
  name: { fontSize: 16, color: theme.ink },
  city: { fontSize: 13, color: theme.inkMuted },
  flagLine: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 999 },
  flagText: { flex: 1, fontSize: 11.5, color: theme.inkSecondary },
  meta: { fontSize: 11, color: theme.brandDeep, marginTop: 2 },
  right: { alignItems: "center", gap: 2, paddingLeft: 2 },
  score: { fontSize: 20 },
});
