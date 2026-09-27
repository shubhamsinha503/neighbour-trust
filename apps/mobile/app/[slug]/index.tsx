import * as Haptics from "expo-haptics";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LanguageButton } from "@/components/LanguageButton";
import { SunlightCard } from "@/components/SunlightCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { categoryIcon } from "@/components/ui/categoryIcon";
import { ConfidenceTag } from "@/components/ui/ConfidenceTag";
import { EmptyState } from "@/components/ui/EmptyState";
import { FlagRow } from "@/components/ui/FlagRow";
import { Icon } from "@/components/ui/Icon";
import { MetricBar } from "@/components/ui/MetricBar";
import { NearbyList } from "@/components/ui/NearbyList";
import { PressableScale } from "@/components/ui/PressableScale";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Txt } from "@/components/ui/Txt";
import {
  fetchConnectivity,
  fetchReport,
  type ConnectivityDetail,
  type Report,
} from "@/src/api";
import { useI18n } from "@/src/i18n";
import { useSaved } from "@/src/saved";
import { scoreColor, theme } from "@/src/theme";

const DETAIL_ROUTE: Record<string, string> = {
  air_quality: "air-quality",
  schools: "schools",
  infrastructure: "connectivity",
};

export default function ReportScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, categoryLabel } = useI18n();
  const { isSaved, toggle } = useSaved();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const saved = isSaved(String(slug));

  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState(false);
  const [nearby, setNearby] = useState<ConnectivityDetail["payload"] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setError(false);
    try {
      setReport(await fetchReport(String(slug)));
    } catch {
      setError(true);
    }
    try {
      const conn = await fetchConnectivity(String(slug));
      setNearby(conn.payload);
    } catch {
      setNearby(null);
    }
  }

  useEffect(() => {
    void load();
  }, [slug]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function onShare() {
    if (!report) return;
    try {
      await Share.share({
        message: `${report.locality.name}, ${report.locality.city} — Trust Score ${
          report.trust_score.score ?? "—"
        }/100 on Neighbour Trust.`,
      });
    } catch {
      /* dismissed */
    }
  }

  const ts = report?.trust_score;
  const available = report?.categories.filter((c) => c.available) ?? [];

  return (
    <View style={styles.screen}>
      {/* Clean header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topbar}>
          <Link href="/" asChild>
            <Pressable hitSlop={8} style={styles.iconBtn}>
              <Icon name="back" size={20} color={theme.ink} />
            </Pressable>
          </Link>
          <View style={styles.topRight}>
            <Pressable
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                toggle(String(slug));
              }}
              hitSlop={8}
              style={styles.iconBtn}
              accessibilityLabel={t("saved.title")}
            >
              <Icon name="heart" size={20} color={saved ? theme.brand : theme.ink} filled={saved} />
            </Pressable>
            {report && (
              <Pressable onPress={onShare} hitSlop={8} style={styles.iconBtn} accessibilityLabel="Share">
                <Icon name="share" size={18} color={theme.ink} />
              </Pressable>
            )}
            <LanguageButton />
          </View>
        </View>
        {report && (
          <View style={styles.headerText}>
            <Txt weight="extrabold" style={styles.name}>
              {report.locality.name}
            </Txt>
            <Txt style={styles.place}>
              {report.locality.city}
              {report.locality.state ? `, ${report.locality.state}` : ""}
              {report.locality.pincode ? ` · ${report.locality.pincode}` : ""}
            </Txt>
          </View>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 28 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} colors={[theme.brand]} />
        }
      >
        {!report && !error && (
          <View style={{ paddingTop: 8 }}>
            <View style={styles.skelScore}>
              <Skeleton style={{ width: 84, height: 84, borderRadius: 999 }} />
              <View style={{ flex: 1, gap: 8 }}>
                <Skeleton style={{ width: "50%", height: 12 }} />
                <Skeleton style={{ width: "100%", height: 14 }} />
                <Skeleton style={{ width: "80%", height: 14 }} />
              </View>
            </View>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} style={{ width: "100%", height: 60, borderRadius: 16, marginTop: 12 }} />
            ))}
          </View>
        )}

        {error && (
          <EmptyState
            icon="warning"
            title={t("load.errorTitle")}
            message={t("report.loadError")}
            actionLabel={t("common.retry")}
            onAction={load}
          />
        )}

        {report && ts && (
          <>
            {/* Score */}
            <Card style={styles.scoreCard}>
              <ScoreBadge score={ts.score} size="lg" showOutOf animate />
              <View style={{ flex: 1 }}>
                <Txt weight="bold" style={styles.eyebrow}>
                  {t("report.basedOn")} {ts.categories_counted} {t("report.of")}{" "}
                  {ts.categories_total} {t("report.categories")}
                </Txt>
                <Txt style={styles.verdict}>{report.verdict}</Txt>
              </View>
            </Card>

            {/* Watch out for */}
            {report.flags.length > 0 && (
              <View style={styles.section}>
                <Txt weight="bold" style={styles.sectionTitle}>
                  {t("overview.watchOut")}
                </Txt>
                {report.flags.map((f, i) => (
                  <FlagRow key={`${f.category}-${i}`} flag={f} />
                ))}
              </View>
            )}

            {/* What's nearby */}
            {nearby && (
              <View style={styles.section}>
                <Txt weight="bold" style={styles.sectionTitle}>
                  {t("overview.nearby")}
                </Txt>
                <NearbyList payload={nearby} />
              </View>
            )}

            {/* Insights — category cards */}
            <View style={styles.section}>
              <Txt weight="bold" style={styles.sectionTitle}>
                {t("overview.insights")}
              </Txt>
              {available.map((c) => {
                const route = DETAIL_ROUTE[c.category];
                const inner = (
                  <Card style={styles.catCard}>
                    <View style={styles.catTop}>
                      <View style={styles.catIcon}>
                        <Icon name={categoryIcon(c.category)} size={18} color={theme.brand} />
                      </View>
                      <Txt weight="bold" style={styles.catLabel}>
                        {categoryLabel(c.category, c.label)}
                      </Txt>
                      {c.score !== null ? (
                        <Txt weight="extrabold" style={[styles.catScore, { color: scoreColor(c.score) }]}>
                          {c.score}
                        </Txt>
                      ) : (
                        <Txt style={styles.catNone}>{t("common.noDataYet")}</Txt>
                      )}
                    </View>
                    {c.score !== null && (
                      <View style={{ marginTop: 12 }}>
                        <MetricBar value={c.score} color={scoreColor(c.score)} />
                      </View>
                    )}
                    <View style={styles.catBottom}>
                      <ConfidenceTag confidence={c.confidence} />
                      {route ? (
                        <View style={styles.detailsLink}>
                          <Txt weight="semibold" style={styles.detailsText}>
                            {t("report.details")}
                          </Txt>
                          <Icon name="chevron" size={14} color={theme.brand} />
                        </View>
                      ) : null}
                    </View>
                  </Card>
                );
                return route ? (
                  <Link key={c.category} href={`/${report.locality.slug}/${route}?score=${c.score ?? ""}`} asChild>
                    <PressableScale>{inner}</PressableScale>
                  </Link>
                ) : (
                  <View key={c.category}>{inner}</View>
                );
              })}
            </View>

            {/* Sunlight */}
            <View style={styles.section}>
              <SunlightCard
                name={report.locality.name}
                lat={report.locality.lat}
                lon={report.locality.lon}
                slug={report.locality.slug}
              />
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <View style={{ flex: 1 }}>
                <Button
                  label={t("overview.compare")}
                  variant="secondary"
                  icon="⇄"
                  onPress={() => router.push({ pathname: "/compare", params: { add: String(slug) } })}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={t("overview.viewMap")}
                  icon="◎"
                  onPress={() => router.push(`/${report.locality.slug}/sunlight`)}
                />
              </View>
            </View>

            {report.sources_used.length > 0 && (
              <View style={styles.sources}>
                <Txt style={styles.sourcesLabel}>{t("report.sources")}</Txt>
                <Txt style={styles.sourcesText}>{report.sources_used.join(" · ")}</Txt>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.page },
  header: { paddingHorizontal: 12, paddingBottom: 8 },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  headerText: { marginTop: 8, paddingHorizontal: 4 },
  name: { fontSize: 26, color: theme.ink, letterSpacing: -0.5 },
  place: { fontSize: 13.5, color: theme.inkSecondary, marginTop: 2 },
  skelScore: { flexDirection: "row", alignItems: "center", gap: 18, marginTop: 8 },
  scoreCard: { flexDirection: "row", alignItems: "center", gap: 18, marginTop: 8 },
  eyebrow: { fontSize: 11, textTransform: "uppercase", color: theme.brand, letterSpacing: 0.5 },
  verdict: { fontSize: 14, color: theme.ink, marginTop: 6, lineHeight: 20 },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 18, color: theme.ink, marginBottom: 12 },
  catCard: { marginBottom: 10, padding: 14 },
  catTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  catIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: theme.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  catLabel: { flex: 1, fontSize: 15, color: theme.ink },
  catScore: { fontSize: 22 },
  catNone: { fontSize: 12, color: theme.inkMuted },
  catBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  detailsLink: { flexDirection: "row", alignItems: "center", gap: 2 },
  detailsText: { fontSize: 12, color: theme.brand },
  actions: { flexDirection: "row", gap: 12, marginTop: 24 },
  sources: { marginTop: 24 },
  sourcesLabel: { fontSize: 10, color: theme.inkMuted },
  sourcesText: { fontSize: 12, color: theme.inkSecondary, marginTop: 4 },
});
