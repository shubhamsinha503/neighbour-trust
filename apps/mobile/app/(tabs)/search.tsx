import { useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LanguageButton } from "@/components/LanguageButton";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { LocalityRow } from "@/components/ui/LocalityRow";
import { PressableScale } from "@/components/ui/PressableScale";
import { LocalityRowSkeleton } from "@/components/ui/Skeleton";
import { Txt } from "@/components/ui/Txt";
import { useI18n } from "@/src/i18n";
import { cityCounts, useLocalities } from "@/src/useLocalities";
import { radius, theme } from "@/src/theme";

type SortMode = "relevance" | "score" | "az";
const SORT_ORDER: SortMode[] = ["relevance", "score", "az"];
const MIN_SCORES = [0, 60, 70, 80];

export default function SearchScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { data, error, loading, reload } = useLocalities();
  const params = useLocalSearchParams<{ q?: string }>();

  const [query, setQuery] = useState("");
  const [city, setCity] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("relevance");
  const [minScore, setMinScore] = useState(0);
  const [warningsOnly, setWarningsOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    reload();
  }, [reload]);

  useEffect(() => {
    if (!loading) setRefreshing(false);
  }, [loading]);

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
    const filtered = data
      .filter((l) => (city ? l.city === city : true))
      .filter((l) => (minScore > 0 ? (l.score ?? -1) >= minScore : true))
      .filter((l) => (warningsOnly ? l.top_flag !== null : true))
      .filter((l) =>
        q
          ? l.name.toLowerCase().includes(q) || l.city.toLowerCase().includes(q)
          : true,
      );
    const sorted = [...filtered];
    if (sort === "score") {
      sorted.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    } else if (sort === "az") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      sorted.sort(
        (a, b) =>
          b.categories_with_data - a.categories_with_data ||
          (b.score ?? -1) - (a.score ?? -1),
      );
    }
    return sorted;
  }, [data, query, city, sort, minScore, warningsOnly]);

  const filterCount = (minScore > 0 ? 1 : 0) + (warningsOnly ? 1 : 0);

  function cycleSort() {
    void Haptics.selectionAsync();
    setSort((s) => SORT_ORDER[(SORT_ORDER.indexOf(s) + 1) % SORT_ORDER.length]);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Icon name="heart" size={14} color="#ffffff" filled />
          </View>
          <Txt weight="extrabold" style={styles.brand}>
            {t("brand")}
          </Txt>
        </View>
        <LanguageButton />
      </View>

      <Txt weight="extrabold" style={styles.title}>
        {t("search.title")}
      </Txt>
      <Txt style={styles.subtitle}>{t("search.subtitle")}</Txt>

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

      <View style={styles.controls}>
        <PressableScale style={styles.control} onPress={() => setFiltersOpen(true)} hitSlop={6}>
          <Icon name="menu" size={15} color={theme.ink} />
          <Txt weight="semibold" style={styles.controlText}>
            {t("filters.title")}
            {filterCount > 0 ? ` (${filterCount})` : ""}
          </Txt>
        </PressableScale>
        <PressableScale style={styles.control} onPress={cycleSort} hitSlop={6}>
          <Txt weight="semibold" style={styles.controlText}>
            {t("sort.label")}: {t(`sort.${sort}`)}
          </Txt>
          <Icon name="chevron" size={14} color={theme.inkMuted} />
        </PressableScale>
        <View style={{ flex: 1 }} />
        {data && (
          <Txt weight="medium" style={styles.count}>
            {results.length} {t("search.count")}
          </Txt>
        )}
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
          contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} colors={[theme.brand]} />
          }
          ListEmptyComponent={
            <EmptyState icon="search" title={t("search.emptyTitle")} message={t("search.empty")} />
          }
          renderItem={({ item }) => <LocalityRow item={item} />}
        />
      )}

      <Modal visible={filtersOpen} transparent animationType="fade" onRequestClose={() => setFiltersOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setFiltersOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]} onPress={() => {}}>
            <View style={styles.grabber} />
            <Txt weight="extrabold" style={styles.sheetTitle}>
              {t("filters.title")}
            </Txt>

            <Txt weight="semibold" style={styles.sheetLabel}>
              {t("filters.minScore")}
            </Txt>
            <View style={styles.scoreOpts}>
              {MIN_SCORES.map((s) => (
                <Chip
                  key={s}
                  label={s === 0 ? t("filters.any") : `${s}+`}
                  active={minScore === s}
                  onPress={() => setMinScore(s)}
                />
              ))}
            </View>

            <PressableScale
              style={styles.toggleRow}
              onPress={() => {
                void Haptics.selectionAsync();
                setWarningsOnly((v) => !v);
              }}
            >
              <Txt weight="medium" style={styles.toggleLabel}>
                {t("filters.withWarnings")}
              </Txt>
              <View style={[styles.checkbox, warningsOnly && styles.checkboxOn]}>
                {warningsOnly && <Icon name="check" size={14} color="#ffffff" />}
              </View>
            </PressableScale>

            <View style={styles.sheetActions}>
              <PressableScale
                style={styles.resetBtn}
                onPress={() => {
                  setMinScore(0);
                  setWarningsOnly(false);
                }}
              >
                <Txt weight="semibold" style={styles.resetText}>
                  {t("filters.reset")}
                </Txt>
              </PressableScale>
              <PressableScale style={styles.applyBtn} onPress={() => setFiltersOpen(false)}>
                <Txt weight="bold" style={styles.applyText}>
                  {t("filters.apply")}
                </Txt>
              </PressableScale>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.page, paddingHorizontal: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  brandMark: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: theme.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { fontSize: 15, color: theme.ink },
  title: { fontSize: 28, color: theme.ink, letterSpacing: -0.6 },
  subtitle: { fontSize: 13.5, color: theme.inkSecondary, marginTop: 3, marginBottom: 14 },
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
  controls: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, marginBottom: 8 },
  control: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.hairline,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  controlText: { fontSize: 12.5, color: theme.ink },
  count: { fontSize: 12, color: theme.inkMuted },
  backdrop: { flex: 1, backgroundColor: "rgba(16,33,58,0.35)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: theme.hairline,
    marginBottom: 14,
  },
  sheetTitle: { fontSize: 19, color: theme.ink, marginBottom: 16 },
  sheetLabel: { fontSize: 13, color: theme.inkSecondary, marginBottom: 10 },
  scoreOpts: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    marginBottom: 20,
  },
  toggleLabel: { fontSize: 14, color: theme.ink, flex: 1 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: theme.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: theme.brand, borderColor: theme.brand },
  sheetActions: { flexDirection: "row", gap: 12 },
  resetBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.hairline,
  },
  resetText: { fontSize: 14, color: theme.inkSecondary },
  applyBtn: {
    flex: 2,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: theme.brand,
  },
  applyText: { fontSize: 14, color: "#ffffff" },
});
