import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { categoryIcon } from "@/components/ui/categoryIcon";
import { PressableScale } from "@/components/ui/PressableScale";
import { Txt } from "@/components/ui/Txt";
import { fetchReport, type Report } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { useLocalities } from "@/src/useLocalities";
import { radius, scoreColor, theme } from "@/src/theme";

// The category rows shown in the table, in report order.
const ROW_ORDER = ["schools", "crime", "air_quality", "water", "infrastructure"];

export default function CompareScreen() {
  const { t, categoryLabel } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const { data } = useLocalities();

  const [slugs, setSlugs] = useState<string[]>(
    typeof params.add === "string" && params.add ? [params.add] : [],
  );
  const [reports, setReports] = useState<Record<string, Report | null>>({});
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");

  // Fetch each selected locality's report once.
  useEffect(() => {
    slugs.forEach((s) => {
      if (reports[s] === undefined) {
        setReports((r) => ({ ...r, [s]: null }));
        fetchReport(s)
          .then((rep) => setReports((r) => ({ ...r, [s]: rep })))
          .catch(() => setReports((r) => ({ ...r, [s]: null })));
      }
    });
  }, [slugs, reports]);

  const cols = useMemo(() => slugs.map((s) => ({ slug: s, report: reports[s] })), [slugs, reports]);

  const pickList = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data
      .filter((l) => !slugs.includes(l.slug))
      .filter((l) => (q ? l.name.toLowerCase().includes(q) || l.city.toLowerCase().includes(q) : true))
      .slice(0, 40);
  }, [data, query, slugs]);

  function labelFor(cat: string): string {
    for (const s of slugs) {
      const rep = reports[s];
      const c = rep?.categories.find((x) => x.category === cat);
      if (c) return categoryLabel(cat, c.label);
    }
    return categoryLabel(cat, cat);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topbar}>
        <Link href="/" asChild>
          <Pressable hitSlop={8} style={styles.back}>
            <Icon name="back" size={20} color={theme.inkSecondary} />
            <Txt style={styles.backText}>{t("report.back")}</Txt>
          </Pressable>
        </Link>
        <Txt weight="bold" style={styles.title}>
          {t("compare.title")}
        </Txt>
        <View style={{ width: 80 }} />
      </View>

      {slugs.length === 0 ? (
        <EmptyState
          icon="search"
          title={t("compare.title")}
          message={t("compare.empty")}
          actionLabel={t("compare.add")}
          onAction={() => setPicking(true)}
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
          {/* Header: locality columns */}
          <View style={styles.headRow}>
            <View style={styles.rowLabel} />
            {cols.map((col) => (
              <View key={col.slug} style={styles.col}>
                <Pressable
                  hitSlop={8}
                  onPress={() => setSlugs((s) => s.filter((x) => x !== col.slug))}
                  style={styles.remove}
                >
                  <Txt weight="bold" style={styles.removeText}>✕</Txt>
                </Pressable>
                <Txt weight="bold" style={styles.colName} numberOfLines={1}>
                  {col.report?.locality.name ?? col.slug}
                </Txt>
                <Txt style={styles.colCity} numberOfLines={1}>
                  {col.report?.locality.city ?? ""}
                </Txt>
                {col.report ? (
                  <Txt weight="extrabold" style={[styles.colScore, { color: scoreColor(col.report.trust_score.score) }]}>
                    {col.report.trust_score.score ?? "—"}
                  </Txt>
                ) : (
                  <ActivityIndicator color={theme.brand} style={{ marginTop: 8 }} />
                )}
              </View>
            ))}
            {slugs.length < 3 && (
              <PressableScale style={styles.addCol} onPress={() => setPicking(true)}>
                <Icon name="plus" size={22} color={theme.brand} />
                <Txt weight="semibold" style={styles.addColText}>
                  {t("compare.add")}
                </Txt>
              </PressableScale>
            )}
          </View>

          {/* Category rows */}
          {ROW_ORDER.map((cat) => (
            <View key={cat} style={styles.dataRow}>
              <View style={styles.rowLabel}>
                <Icon name={categoryIcon(cat)} size={15} color={theme.inkSecondary} />
                <Txt weight="medium" style={styles.rowLabelText} numberOfLines={1}>
                  {labelFor(cat)}
                </Txt>
              </View>
              {cols.map((col) => {
                const c = col.report?.categories.find((x) => x.category === cat);
                const score = c && c.available ? c.score : null;
                return (
                  <View key={col.slug} style={styles.cell}>
                    <Txt
                      weight="bold"
                      style={[styles.cellScore, { color: score !== null ? scoreColor(score) : theme.inkMuted }]}
                    >
                      {col.report ? (score ?? "—") : ""}
                    </Txt>
                  </View>
                );
              })}
              {slugs.length < 3 && <View style={styles.addCol} />}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Locality picker */}
      <Modal visible={picking} animationType="slide" onRequestClose={() => setPicking(false)}>
        <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
          <View style={styles.topbar}>
            <Pressable hitSlop={8} onPress={() => setPicking(false)} style={styles.back}>
              <Icon name="back" size={20} color={theme.inkSecondary} />
              <Txt style={styles.backText}>{t("report.back")}</Txt>
            </Pressable>
            <Txt weight="bold" style={styles.title}>
              {t("compare.pick")}
            </Txt>
            <View style={{ width: 80 }} />
          </View>
          <View style={styles.searchBar}>
            <Icon name="search" size={18} color={theme.inkMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t("search.placeholder")}
              placeholderTextColor={theme.inkMuted}
              style={styles.input}
              autoCorrect={false}
            />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
            {pickList.map((l) => (
              <PressableScale
                key={l.slug}
                style={styles.pickRow}
                onPress={() => {
                  setSlugs((s) => (s.length < 3 ? [...s, l.slug] : s));
                  setQuery("");
                  setPicking(false);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Txt weight="bold" style={styles.pickName}>{l.name}</Txt>
                  <Txt style={styles.pickCity}>{l.city}</Txt>
                </View>
                <Txt weight="extrabold" style={[styles.pickScore, { color: scoreColor(l.score) }]}>
                  {l.score ?? "—"}
                </Txt>
              </PressableScale>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.page },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  back: { flexDirection: "row", alignItems: "center", gap: 2, width: 80 },
  backText: { fontSize: 13, color: theme.inkSecondary },
  title: { fontSize: 16, color: theme.ink },
  headRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 6 },
  rowLabel: { width: 96, flexDirection: "row", alignItems: "center", gap: 6, paddingRight: 6 },
  rowLabelText: { flex: 1, fontSize: 12.5, color: theme.inkSecondary },
  col: {
    flex: 1,
    alignItems: "center",
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.hairline,
    borderRadius: radius.md,
    padding: 10,
    marginHorizontal: 3,
  },
  remove: { position: "absolute", top: 4, right: 8, zIndex: 2 },
  removeText: { fontSize: 13, color: theme.inkMuted },
  colName: { fontSize: 13, color: theme.ink, textAlign: "center" },
  colCity: { fontSize: 10.5, color: theme.inkMuted, textAlign: "center" },
  colScore: { fontSize: 26, marginTop: 6 },
  addCol: {
    width: 64,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginHorizontal: 3,
  },
  addColText: { fontSize: 10, color: theme.brand, textAlign: "center" },
  dataRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: theme.hairline,
    paddingVertical: 14,
  },
  cell: { flex: 1, alignItems: "center", marginHorizontal: 3 },
  cellScore: { fontSize: 18 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    backgroundColor: theme.surface,
    borderWidth: 1.5,
    borderColor: theme.hairline,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  input: { flex: 1, fontSize: 15, color: theme.ink, paddingVertical: 2 },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.hairline,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  pickName: { fontSize: 15, color: theme.ink },
  pickCity: { fontSize: 12, color: theme.inkMuted, marginTop: 2 },
  pickScore: { fontSize: 20 },
});
