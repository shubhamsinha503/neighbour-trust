import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { LocalityRow } from "@/components/ui/LocalityRow";
import { LocalityRowSkeleton } from "@/components/ui/Skeleton";
import { Txt } from "@/components/ui/Txt";
import { useI18n } from "@/src/i18n";
import { cityCounts, useLocalities } from "@/src/useLocalities";
import { theme } from "@/src/theme";

export default function SearchScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { data, error, loading, reload } = useLocalities();
  const params = useLocalSearchParams<{ q?: string }>();

  const [query, setQuery] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    reload();
  }, [reload]);

  // Clear the pull-to-refresh spinner once the reload settles.
  useEffect(() => {
    if (!loading) setRefreshing(false);
  }, [loading]);

  // A tap from Home (a city tile or an example chip) arrives as ?q= — seed the
  // box with it. Runs whenever the param changes so repeat taps re-seed.
  useEffect(() => {
    if (typeof params.q === "string") setQuery(params.q);
  }, [params.q]);

  const cities = useMemo(
    () => (data ? cityCounts(data).map((c) => c.city) : []),
    [data],
  );

  const results = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data
      .filter((l) => (city ? l.city === city : true))
      .filter((l) =>
        q
          ? l.name.toLowerCase().includes(q) || l.city.toLowerCase().includes(q)
          : true,
      )
      .sort(
        (a, b) =>
          b.categories_with_data - a.categories_with_data ||
          (b.score ?? -1) - (a.score ?? -1),
      );
  }, [data, query, city]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <Txt weight="extrabold" style={styles.title}>
        {t("search.title")}
      </Txt>

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

      {cities.length > 0 && (
        <FlatList
          data={["__all__", ...cities]}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(c) => c}
          style={styles.chipsRow}
          contentContainerStyle={{ gap: 8, paddingRight: 16, alignItems: "center" }}
          renderItem={({ item }) => {
            const isAll = item === "__all__";
            return (
              <Chip
                label={isAll ? t("home.allCities") : item}
                active={isAll ? city === null : city === item}
                onPress={() => setCity(isAll ? null : item)}
              />
            );
          }}
        />
      )}

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
          ListHeaderComponent={
            <Txt weight="medium" style={styles.count}>
              {results.length} {t("search.count")} · {t("search.sortNote")}
            </Txt>
          }
          ListEmptyComponent={
            <EmptyState icon="search" title={t("search.emptyTitle")} message={t("search.empty")} />
          }
          renderItem={({ item }) => <LocalityRow item={item} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.page, paddingHorizontal: 16 },
  title: { fontSize: 26, color: theme.ink, letterSpacing: -0.5, marginBottom: 12 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.surface,
    borderWidth: 1.5,
    borderColor: theme.hairline,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  input: { flex: 1, fontSize: 15, color: theme.ink, paddingVertical: 2 },
  chipsRow: { marginTop: 12, marginBottom: 4, height: 40, flexGrow: 0, flexShrink: 0 },
  count: { fontSize: 12, color: theme.inkMuted, marginBottom: 10 },
  empty: { fontSize: 14, color: theme.inkMuted, marginTop: 32, textAlign: "center" },
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
