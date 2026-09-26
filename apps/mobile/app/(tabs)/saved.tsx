import { useMemo } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/Icon";
import { LocalityRow } from "@/components/ui/LocalityRow";
import { Txt } from "@/components/ui/Txt";
import { useI18n } from "@/src/i18n";
import { useSaved } from "@/src/saved";
import { useLocalities } from "@/src/useLocalities";
import { theme } from "@/src/theme";

export default function SavedScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { saved } = useSaved();
  const { data } = useLocalities();

  // Preserve the user's saved order (most-recent first) rather than the API order.
  const items = useMemo(() => {
    if (!data) return [];
    const bySlug = new Map(data.map((l) => [l.slug, l]));
    return saved.map((slug) => bySlug.get(slug)).filter((l) => l !== undefined);
  }, [data, saved]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <Txt weight="extrabold" style={styles.title}>
        {t("saved.title")}
      </Txt>

      {items.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <Icon name="bookmark" size={30} color={theme.brand} />
          </View>
          <Txt weight="bold" style={styles.emptyTitle}>
            {t("saved.empty")}
          </Txt>
          <Txt style={styles.emptyHint}>{t("saved.hint")}</Txt>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.slug}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => <LocalityRow item={item} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.page, paddingHorizontal: 16 },
  title: { fontSize: 26, color: theme.ink, letterSpacing: -0.5, marginBottom: 12 },
  emptyWrap: { alignItems: "center", justifyContent: "center", paddingHorizontal: 24, marginTop: 80 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: theme.brandSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 17, color: theme.ink, marginBottom: 8 },
  emptyHint: { fontSize: 14, color: theme.inkMuted, textAlign: "center", lineHeight: 20 },
});
