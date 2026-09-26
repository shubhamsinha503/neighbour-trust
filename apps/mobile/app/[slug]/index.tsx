import { Link, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LanguageButton } from "@/components/LanguageButton";
import { SunlightCard } from "@/components/SunlightCard";
import { Card } from "@/components/ui/Card";
import { categoryIcon } from "@/components/ui/categoryIcon";
import { ConfidenceTag } from "@/components/ui/ConfidenceTag";
import { FlagRow } from "@/components/ui/FlagRow";
import { Icon } from "@/components/ui/Icon";
import { NearbyList } from "@/components/ui/NearbyList";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { Signal } from "@/components/ui/Signal";
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
  const insets = useSafeAreaInsets();
  const saved = isSaved(String(slug));

  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState(false);
  // Connectivity is a best-effort side fetch for "what's nearby": absent data is
  // fine and simply hides the section, so it never blocks or fails the report.
  const [nearby, setNearby] = useState<ConnectivityDetail["payload"] | null>(null);

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

  const ts = report?.trust_score;

  // Honest "at a glance" signals derived from real category scores: the highest
  // scored area (only when genuinely strong) and the lowest (only when weak
  // enough to flag), so a locality that's strong everywhere shows no false caution.
  const scored = report?.categories.filter((c) => c.available && c.score !== null) ?? [];
  const strongest = scored.reduce<(typeof scored)[number] | null>(
    (best, c) => (best === null || (c.score ?? 0) > (best.score ?? 0) ? c : best),
    null,
  );
  const weakest = scored.reduce<(typeof scored)[number] | null>(
    (low, c) => (low === null || (c.score ?? 0) < (low.score ?? 0) ? c : low),
    null,
  );
  const showStrong = strongest !== null && (strongest.score ?? 0) >= 70;
  const showWeak =
    weakest !== null &&
    strongest !== null &&
    weakest.category !== strongest.category &&
    (weakest.score ?? 0) < 55;

  async function onShare() {
    if (!report) return;
    const s = report.trust_score.score;
    try {
      await Share.share({
        message: `${report.locality.name}, ${report.locality.city} — Trust Score ${
          s ?? "—"
        }/100 on Neighbour Trust.`,
      });
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  }

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
            <Txt style={styles.back}>← {t("report.back")}</Txt>
          </Pressable>
        </Link>
        <View style={styles.topRight}>
          <Pressable
            onPress={() => toggle(String(slug))}
            hitSlop={10}
            accessibilityLabel={t("saved.title")}
          >
            <Icon
              name="heart"
              size={22}
              color={saved ? theme.brand : theme.inkMuted}
              filled={saved}
            />
          </Pressable>
          {report && (
            <Pressable onPress={onShare} hitSlop={10} accessibilityLabel="Share">
              <Icon name="share" size={20} color={theme.inkMuted} />
            </Pressable>
          )}
          <LanguageButton />
        </View>
      </View>

      {!report && !error && (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.brand} />
      )}

      {error && (
        <Pressable onPress={load} style={styles.errorCard}>
          <Txt style={styles.errorText}>{t("report.loadError")}</Txt>
        </Pressable>
      )}

      {report && ts && (
        <>
          <Txt weight="extrabold" style={styles.name}>
            {report.locality.name}
          </Txt>
          <Txt style={styles.place}>
            {report.locality.city}
            {report.locality.pincode ? ` · ${report.locality.pincode}` : ""}
          </Txt>

          {/* Score card — the headline verdict, with a ring for the number. */}
          <Card style={styles.scoreCard}>
            <ScoreBadge score={ts.score} size="lg" showOutOf />
            <View style={{ flex: 1 }}>
              <Txt weight="bold" style={styles.eyebrow}>
                {t("report.basedOn")} {ts.categories_counted} {t("report.of")}{" "}
                {ts.categories_total} {t("report.categories")}
              </Txt>
              {/* Verdict from the API, English for now — the same layer-2
                  boundary the website has. */}
              <Txt style={styles.verdict}>{report.verdict}</Txt>
            </View>
          </Card>

          {/* At a glance — real strongest / weakest measured areas */}
          {(showStrong || showWeak) && (
            <View style={styles.section}>
              <Txt weight="bold" style={styles.sectionTitle}>
                {t("overview.atGlance")}
              </Txt>
              {showStrong && strongest && (
                <Signal
                  tone="positive"
                  title={t("overview.strongest")}
                  detail={t("overview.strongestDetail")
                    .replace("{cat}", categoryLabel(strongest.category, strongest.label))
                    .replace("{n}", String(strongest.score))}
                />
              )}
              {showWeak && weakest && (
                <Signal
                  tone="caution"
                  title={t("overview.weakest")}
                  detail={t("overview.weakestDetail")
                    .replace("{cat}", categoryLabel(weakest.category, weakest.label))
                    .replace("{n}", String(weakest.score))}
                />
              )}
            </View>
          )}

          {/* Watch-outs */}
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

          {/* Insights — one card per category with its confidence and a link. */}
          <View style={styles.section}>
            <Txt weight="bold" style={styles.sectionTitle}>
              {t("overview.insights")}
            </Txt>
            {report.categories
              .filter((c) => c.available)
              .map((c) => {
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
                        <Txt
                          weight="extrabold"
                          style={[styles.catScore, { color: scoreColor(c.score) }]}
                        >
                          {c.score}
                        </Txt>
                      ) : (
                        <Txt style={styles.catNone}>{t("common.noDataYet")}</Txt>
                      )}
                    </View>
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
                  <Link
                    key={c.category}
                    href={`/${report.locality.slug}/${route}?score=${c.score ?? ""}`}
                    asChild
                  >
                    <Pressable>{inner}</Pressable>
                  </Link>
                ) : (
                  <View key={c.category}>{inner}</View>
                );
              })}
          </View>

          {/* What's nearby */}
          {nearby && (
            <View style={styles.section}>
              <Txt weight="bold" style={styles.sectionTitle}>
                {t("overview.nearby")}
              </Txt>
              <NearbyList payload={nearby} />
            </View>
          )}

          <SunlightCard
            name={report.locality.name}
            lat={report.locality.lat}
            lon={report.locality.lon}
            slug={report.locality.slug}
          />

          {report.sources_used.length > 0 && (
            <View style={styles.sources}>
              <Txt style={styles.sourcesLabel}>{t("report.sources")}</Txt>
              <Txt style={styles.sourcesText}>{report.sources_used.join(" · ")}</Txt>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.page },
  back: { fontSize: 13, color: theme.inkMuted },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  topRight: { flexDirection: "row", alignItems: "center", gap: 14 },
  name: { fontSize: 27, color: theme.ink, letterSpacing: -0.5, marginTop: 4 },
  place: { fontSize: 14, color: theme.inkSecondary, marginTop: 2 },
  scoreCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    marginTop: 16,
  },
  eyebrow: {
    fontSize: 11,
    textTransform: "uppercase",
    color: theme.brand,
    letterSpacing: 0.5,
  },
  verdict: { fontSize: 14, color: theme.ink, marginTop: 6, lineHeight: 20 },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 18, color: theme.ink, marginBottom: 12 },
  catCard: { marginBottom: 10, padding: 14 },
  catTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  catIcon: {
    width: 34,
    height: 34,
    borderRadius: 999,
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
    marginTop: 10,
  },
  detailsLink: { flexDirection: "row", alignItems: "center", gap: 2 },
  detailsText: { fontSize: 12, color: theme.brand },
  sources: { marginTop: 24 },
  sourcesLabel: { fontSize: 10, color: theme.inkMuted },
  sourcesText: { fontSize: 12, color: theme.inkSecondary, marginTop: 4 },
  errorCard: {
    marginTop: 20,
    borderWidth: 1,
    borderColor: theme.hairline,
    backgroundColor: theme.surface,
    borderRadius: 16,
    padding: 20,
  },
  errorText: { fontSize: 13, color: theme.inkSecondary },
});
