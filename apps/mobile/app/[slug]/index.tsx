import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
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
import { radius, scoreColor, theme } from "@/src/theme";

const DETAIL_ROUTE: Record<string, string> = {
  air_quality: "air-quality",
  schools: "schools",
  infrastructure: "connectivity",
};

type Tab = "overview" | "insights" | "nearby" | "sun";

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
  const [tab, setTab] = useState<Tab>("overview");
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

  // Honest highlights (strong categories + real nearby facts) and considerations
  // (the report's own flags) — nothing invented.
  const highlights: string[] = [];
  available
    .filter((c) => (c.score ?? 0) >= 75)
    .slice(0, 3)
    .forEach((c) =>
      highlights.push(
        t("hl.strong")
          .replace("{cat}", categoryLabel(c.category, c.label))
          .replace("{n}", String(c.score)),
      ),
    );
  if ((nearby?.hospitals ?? 0) > 0) highlights.push(t("hl.hospitals"));
  if ((nearby?.parks ?? 0) > 0) highlights.push(t("hl.parks"));
  const considers = (report?.flags ?? []).map((f) => f.headline).slice(0, 3);

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: "overview", label: t("overview.tabOverview") },
    { key: "insights", label: t("overview.insights") },
    { key: "nearby", label: t("overview.tabNearby") },
    { key: "sun", label: t("overview.tabSun") },
  ];

  return (
    <View style={styles.screen}>
      {/* Gradient header */}
      <LinearGradient
        colors={[theme.brand, "#B3175A"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.topbar}>
          <Link href="/" asChild>
            <Pressable hitSlop={8} style={styles.iconBtn}>
              <Icon name="back" size={20} color="#ffffff" />
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
              <Icon name="heart" size={20} color="#ffffff" filled={saved} />
            </Pressable>
            {report && (
              <Pressable onPress={onShare} hitSlop={8} style={styles.iconBtn} accessibilityLabel="Share">
                <Icon name="share" size={18} color="#ffffff" />
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
              {report.locality.pincode ? ` · ${report.locality.pincode}` : ""}
            </Txt>
          </View>
        )}
      </LinearGradient>

      {/* Tabs */}
      {report && (
        <View style={styles.tabsRow}>
          {TABS.map((tb) => {
            const on = tb.key === tab;
            return (
              <PressableScale
                key={tb.key}
                style={styles.tab}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setTab(tb.key);
                }}
              >
                <Txt weight={on ? "bold" : "medium"} style={[styles.tabLabel, on && styles.tabLabelOn]}>
                  {tb.label}
                </Txt>
                {on && <View style={styles.tabBar} />}
              </PressableScale>
            );
          })}
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 28 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} colors={[theme.brand]} />
        }
      >
        {!report && !error && (
          <View>
            <Skeleton style={{ width: 96, height: 96, borderRadius: 999, alignSelf: "center" }} />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} style={{ width: "100%", height: 66, borderRadius: 18, marginTop: 12 }} />
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

        {report && ts && tab === "overview" && (
          <>
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

            {/* Category tiles */}
            <Txt weight="bold" style={styles.sectionTitle}>
              {t("overview.categories")}
            </Txt>
            <View style={styles.tiles}>
              {available.map((c) => {
                const route = DETAIL_ROUTE[c.category];
                const tile = (
                  <View style={styles.tile}>
                    <View style={styles.tileIcon}>
                      <Icon name={categoryIcon(c.category)} size={18} color={theme.brand} />
                    </View>
                    <Txt weight="extrabold" style={[styles.tileScore, { color: scoreColor(c.score) }]}>
                      {c.score ?? "—"}
                    </Txt>
                    <Txt weight="medium" style={styles.tileLabel} numberOfLines={1}>
                      {categoryLabel(c.category, c.label)}
                    </Txt>
                  </View>
                );
                return route ? (
                  <Link key={c.category} href={`/${report.locality.slug}/${route}?score=${c.score ?? ""}`} asChild>
                    <PressableScale style={styles.tileWrap}>{tile}</PressableScale>
                  </Link>
                ) : (
                  <View key={c.category} style={styles.tileWrap}>
                    {tile}
                  </View>
                );
              })}
            </View>

            {/* Key highlights */}
            {highlights.length > 0 && (
              <>
                <Txt weight="bold" style={styles.sectionTitle}>
                  {t("overview.highlights")}
                </Txt>
                <Card>
                  {highlights.map((h, i) => (
                    <View key={i} style={[styles.line, i > 0 && styles.lineDiv]}>
                      <Icon name="check" size={17} color={theme.good} />
                      <Txt style={styles.lineText}>{h}</Txt>
                    </View>
                  ))}
                </Card>
              </>
            )}

            {/* Things to consider */}
            {considers.length > 0 && (
              <>
                <Txt weight="bold" style={styles.sectionTitle}>
                  {t("overview.consider")}
                </Txt>
                <Card>
                  {considers.map((c, i) => (
                    <View key={i} style={[styles.line, i > 0 && styles.lineDiv]}>
                      <Icon name="warning" size={17} color={theme.warn} />
                      <Txt style={styles.lineText}>{c}</Txt>
                    </View>
                  ))}
                </Card>
              </>
            )}

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
          </>
        )}

        {report && tab === "insights" && (
          <View>
            {available.map((c) => {
              const route = DETAIL_ROUTE[c.category];
              const inner = (
                <Card style={styles.catCard}>
                  <View style={styles.catTop}>
                    <View style={styles.tileIcon}>
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
        )}

        {report && tab === "nearby" && (
          nearby ? (
            <NearbyList payload={nearby} />
          ) : (
            <EmptyState icon="map" title={t("common.noDataYet")} message={t("report.sources")} />
          )
        )}

        {report && tab === "sun" && (
          <SunlightCard
            name={report.locality.name}
            lat={report.locality.lat}
            lon={report.locality.lon}
            slug={report.locality.slug}
          />
        )}

        {/* Sources footer (all tabs) */}
        {report && report.sources_used.length > 0 && (
          <View style={styles.sources}>
            <Txt style={styles.sourcesLabel}>{t("report.sources")}</Txt>
            <Txt style={styles.sourcesText}>{report.sources_used.join(" · ")}</Txt>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.page },
  header: {
    paddingHorizontal: 12,
    paddingBottom: 22,
    minHeight: 120,
    justifyContent: "space-between",
  },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { marginTop: 14, paddingHorizontal: 4 },
  name: { fontSize: 26, color: "#ffffff", letterSpacing: -0.5 },
  place: { fontSize: 13.5, color: "rgba(255,255,255,0.85)", marginTop: 2 },
  tabsRow: {
    flexDirection: "row",
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.hairline,
    paddingHorizontal: 8,
  },
  tab: { flex: 1, alignItems: "center", paddingVertical: 13 },
  tabLabel: { fontSize: 13, color: theme.inkMuted },
  tabLabelOn: { color: theme.brand },
  tabBar: {
    position: "absolute",
    bottom: 0,
    height: 2.5,
    width: "60%",
    borderRadius: 2,
    backgroundColor: theme.brand,
  },
  scoreCard: { flexDirection: "row", alignItems: "center", gap: 18 },
  eyebrow: { fontSize: 11, textTransform: "uppercase", color: theme.brand, letterSpacing: 0.5 },
  verdict: { fontSize: 14, color: theme.ink, marginTop: 6, lineHeight: 20 },
  sectionTitle: { fontSize: 17, color: theme.ink, marginTop: 22, marginBottom: 12 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tileWrap: { width: "31.5%", flexGrow: 1 },
  tile: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.hairline,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
    gap: 4,
  },
  tileIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: theme.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  tileScore: { fontSize: 20, marginTop: 4 },
  tileLabel: { fontSize: 11, color: theme.inkSecondary },
  line: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  lineDiv: { borderTopWidth: 1, borderTopColor: theme.hairline },
  lineText: { flex: 1, fontSize: 13.5, color: theme.ink, lineHeight: 19 },
  actions: { flexDirection: "row", gap: 12, marginTop: 24 },
  catCard: { marginBottom: 10, padding: 14 },
  catTop: { flexDirection: "row", alignItems: "center", gap: 10 },
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
  sources: { marginTop: 24 },
  sourcesLabel: { fontSize: 10, color: theme.inkMuted },
  sourcesText: { fontSize: 12, color: theme.inkSecondary, marginTop: 4 },
});
