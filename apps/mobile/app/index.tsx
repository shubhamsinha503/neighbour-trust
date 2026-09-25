import { Link } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LanguageButton } from "@/components/LanguageButton";
import { fetchSummaries, type LocalitySummary } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { scoreColor, theme } from "@/src/theme";

export default function HomeScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [all, setAll] = useState<LocalitySummary[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");

  async function load() {
    setError(false);
    try {
      setAll(await fetchSummaries());
    } catch {
      setError(true);
      setAll(null);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const results = useMemo(() => {
    if (!all) return [];
    const q = query.trim().toLowerCase();
    const list = q
      ? all.filter(
          (l) =>
            l.name.toLowerCase().includes(q) || l.city.toLowerCase().includes(q),
        )
      : all;
    return list.slice(0, 100);
  }, [all, query]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Text style={styles.brand}>{t("brand")}</Text>
        <LanguageButton />
      </View>

      <Text style={styles.title}>{t("home.title")}</Text>
      <Text style={styles.subtitle}>{t("home.subtitle")}</Text>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t("home.search")}
        placeholderTextColor={theme.inkMuted}
        style={styles.search}
        autoCorrect={false}
      />

      {error && (
        <Pressable onPress={load} style={styles.errorBox}>
          <Text style={styles.errorText}>{t("home.loadError")}</Text>
        </Pressable>
      )}

      {!all && !error && (
        <ActivityIndicator style={{ marginTop: 32 }} color={theme.brand} />
      )}

      {all && (
        <FlatList
          data={results}
          keyExtractor={(item) => item.slug}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Link href={`/${item.slug}`} asChild>
              <Pressable style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Text style={styles.rowCity}>{item.city}</Text>
                </View>
                <Text style={[styles.score, { color: scoreColor(item.score) }]}>
                  {item.score ?? "—"}
                </Text>
              </Pressable>
            </Link>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16, backgroundColor: theme.page },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  brand: { fontSize: 18, fontWeight: "800", color: theme.ink },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: theme.ink,
    letterSpacing: -0.5,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 14,
    color: theme.inkSecondary,
    marginTop: 6,
    lineHeight: 20,
  },
  search: {
    marginTop: 16,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: theme.hairline,
    backgroundColor: theme.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: theme.ink,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.hairline,
  },
  rowName: { fontSize: 15, fontWeight: "600", color: theme.ink },
  rowCity: { fontSize: 12, color: theme.inkMuted, marginTop: 2 },
  score: { fontSize: 18, fontWeight: "800" },
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
