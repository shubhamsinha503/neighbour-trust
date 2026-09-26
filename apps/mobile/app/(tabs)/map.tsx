import { Link } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { PressableScale } from "@/components/ui/PressableScale";
import { LocalityRowSkeleton } from "@/components/ui/Skeleton";
import { Txt } from "@/components/ui/Txt";
import { useI18n } from "@/src/i18n";
import { useLocalities } from "@/src/useLocalities";
import { theme } from "@/src/theme";

/**
 * The Map tab. The sun & shadow map is per-locality, so this tab is a picker:
 * choose a locality and open its interactive map. Rows link to the sunlight
 * screen (not the report), which is what makes this tab distinct from Search.
 */
export default function MapScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { data, error, loading, reload } = useLocalities();
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    reload();
  }, [reload]);
  useEffect(() => {
    if (!loading) setRefreshing(false);
  }, [loading]);

  const results = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const list = q
      ? data.filter(
          (l) =>
            l.name.toLowerCase().includes(q) || l.city.toLowerCase().includes(q),
        )
      : data;
    return list.slice(0, 60);
  }, [data, query]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <Txt weight="extrabold" style={styles.title}>
        {t("map.title")}
      </Txt>
      <Txt style={styles.subtitle}>{t("map.pickHint")}</Txt>

      <View style={styles.searchBar}>
        <Icon name="search" size={20} color={theme.inkMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("search.placeholder")}
          placeholderTextColor={theme.inkMuted}
          style={styles.input}
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {loading && !data && (
        <View style={{ paddingTop: 12 }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <LocalityRowSkeleton key={i} />
          ))}
        </View>
      )}

      {error && !data && (
        <EmptyState
          icon="warning"
          title={t("load.errorTitle")}
          message={t("load.errorMsg")}
          actionLabel={t("common.retry")}
          onAction={reload}
        />
      )}

      {data && (
        <FlatList
          data={results}
          keyExtractor={(item) => item.slug}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} colors={[theme.brand]} />
          }
          renderItem={({ item }) => (
            <Link href={`/${item.slug}/sunlight`} asChild>
              <PressableScale>
                <View style={styles.row}>
                  <View style={styles.mapIcon}>
                    <Icon name="map" size={18} color={theme.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt weight="bold" style={styles.name} numberOfLines={1}>
                      {item.name}
                    </Txt>
                    <Txt style={styles.city} numberOfLines={1}>
                      {item.city}
                    </Txt>
                  </View>
                  <Icon name="chevron" size={18} color={theme.inkMuted} />
                </View>
              </PressableScale>
            </Link>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.page, paddingHorizontal: 16 },
  title: { fontSize: 26, color: theme.ink, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: theme.inkSecondary, marginTop: 6, lineHeight: 20 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 16,
    backgroundColor: theme.surface,
    borderWidth: 1.5,
    borderColor: theme.hairline,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  input: { flex: 1, fontSize: 15, color: theme.ink, paddingVertical: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.hairline,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  pressed: { backgroundColor: theme.plane },
  mapIcon: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: theme.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 15, color: theme.ink },
  city: { fontSize: 12, color: theme.inkMuted, marginTop: 2 },
  errorBox: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.hairline,
    backgroundColor: theme.surface,
    padding: 16,
  },
  errorText: { fontSize: 13, color: theme.inkSecondary },
});
