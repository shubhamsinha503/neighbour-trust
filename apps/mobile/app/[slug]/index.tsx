import { Link, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LanguageButton } from "@/components/LanguageButton";
import { fetchReport, type Report } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { scoreColor, theme } from "@/src/theme";

const DETAIL_ROUTE: Record<string, string> = {
  air_quality: "air-quality",
  schools: "schools",
  infrastructure: "connectivity",
};

export default function ReportScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, categoryLabel } = useI18n();
  const insets = useSafeAreaInsets();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    try {
      setReport(await fetchReport(String(slug)));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
  }, [slug]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 16,
      }}
    >
      <View style={styles.topbar}>
        <Link href="/" asChild>
          <Pressable>
            <Text style={styles.back}>← {t("report.back")}</Text>
          </Pressable>
        </Link>
        <LanguageButton />
      </View>

      {!report && !error && (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.brand} />
      )}

      {error && (
        <Pressable onPress={load} style={styles.card}>
          <Text style={styles.errorText}>{t("report.loadError")}</Text>
        </Pressable>
      )}

      {report && (
        <>
          <Text style={styles.name}>{report.locality.name}</Text>
          <Text style={styles.place}>
            {report.locality.city}
            {report.locality.pincode ? ` · ${report.locality.pincode}` : ""}
          </Text>

          <View style={styles.scoreCard}>
            <Text
              style={[
                styles.bigScore,
                { color: scoreColor(report.trust_score.score) },
              ]}
            >
              {report.trust_score.score ?? "—"}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.basedOn}>
                {t("report.basedOn")} {report.trust_score.categories_counted}{" "}
                {t("report.of")} {report.trust_score.categories_total}{" "}
                {t("report.categories")}
              </Text>
              {/* Verdict comes from the API, in English for now — the same
                  layer-2 boundary the website has. */}
              <Text style={styles.verdict}>{report.verdict}</Text>
            </View>
          </View>

          {report.categories
            .filter((c) => c.available)
            .map((c) => {
              const route = DETAIL_ROUTE[c.category];
              const row = (
                <View style={styles.catRow}>
                  <Text style={styles.catLabel}>
                    {categoryLabel(c.category, c.label)}
                  </Text>
                  {c.score !== null ? (
                    <Text
                      style={[styles.catScore, { color: scoreColor(c.score) }]}
                    >
                      {c.score}
                    </Text>
                  ) : (
                    <Text style={styles.catNone}>{t("common.noDataYet")}</Text>
                  )}
                  {route ? <Text style={styles.chevron}>›</Text> : null}
                </View>
              );
              return route ? (
                <Link
                  key={c.category}
                  href={`/${report.locality.slug}/${route}`}
                  asChild
                >
                  <Pressable>{row}</Pressable>
                </Link>
              ) : (
                <View key={c.category}>{row}</View>
              );
            })}

          {report.sources_used.length > 0 && (
            <View style={styles.sources}>
              <Text style={styles.sourcesLabel}>{t("report.sources")}</Text>
              <Text style={styles.sourcesText}>
                {report.sources_used.join(" · ")}
              </Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.page },
  back: { fontSize: 12, color: theme.inkMuted },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  name: { fontSize: 24, fontWeight: "800", color: theme.ink, marginTop: 4 },
  place: { fontSize: 13, color: theme.inkSecondary, marginTop: 2 },
  scoreCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: theme.hairline,
    backgroundColor: theme.surface,
    borderRadius: 20,
    padding: 20,
  },
  bigScore: { fontSize: 40, fontWeight: "800" },
  basedOn: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    color: theme.brand,
    letterSpacing: 0.5,
  },
  verdict: { fontSize: 14, fontWeight: "600", color: theme.ink, marginTop: 4 },
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
    borderWidth: 1,
    borderColor: theme.hairline,
    backgroundColor: theme.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  catLabel: { fontSize: 14, fontWeight: "600", color: theme.ink },
  catScore: { fontSize: 18, fontWeight: "800" },
  catNone: { fontSize: 12, color: theme.inkMuted },
  chevron: { fontSize: 20, color: theme.inkMuted, marginLeft: 8 },
  sources: { marginTop: 16 },
  sourcesLabel: { fontSize: 10, color: theme.inkMuted },
  sourcesText: { fontSize: 12, color: theme.inkSecondary, marginTop: 4 },
  card: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: theme.hairline,
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 20,
  },
  errorText: { fontSize: 13, color: theme.inkSecondary },
});
