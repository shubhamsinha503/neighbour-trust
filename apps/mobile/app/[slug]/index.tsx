import * as Haptics from "expo-haptics";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SunlightCard } from "@/components/SunlightCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { categoryIcon } from "@/components/ui/categoryIcon";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
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

/** Accent colour per category, matching the Home "What matters" grid. */
const CAT_COLOR: Record<string, string> = {
  schools: "#2563EB",
  crime: "#F72575",
  air_quality: "#1B9362",
  water: "#06B6D4",
  infrastructure: "#7C3AED",
};

/** A score-band word — a plain restatement of the score, never a new claim. */
function bandKey(score: number | null): string {
  if (score === null) return "band.unscored";
  if (score >= 80) return "band.high";
  if (score >= 70) return "band.good";
  if (score >= 60) return "band.fair";
  return "band.mixed";
}

/** The strip sub-label for a category. Schools is scored purely on access — how
 * many schools are nearby, never their quality — so its band reads as a count of
 * what's close, not a "rating". A "Well rated" word on a card the detail screen
 * flags Low confidence is exactly the contradiction we are avoiding. */
function categoryBandKey(category: string, score: number | null): string {
  if (category !== "schools") return bandKey(score);
  if (score === null) return "band.unscored";
  if (score >= 60) return "band.schoolsPlenty";
  if (score >= 30) return "band.schoolsSome";
  return "band.schoolsFew";
}

/** A short, plain tag for a reported project — Transit, Roads, etc. Matched on
 * the classifier's kind and, failing that, the headline, same as the web card. */
function upcomingTag(kind = "", headline = ""): string {
  const text = `${kind} ${headline}`.toLowerCase();
  if (/metro|rail|rrts/.test(text)) return "Transit";
  if (/road|flyover|underpass|corridor|expressway|tunnel|junction/.test(text)) return "Roads";
  if (/legal|court|stay|litigat/.test(text)) return "Legal";
  if (/water|sewer|drain|power|electric|utility/.test(text)) return "Utilities";
  if (/hospital|school|park|civic|library/.test(text)) return "Civic";
  return "Project";
}

/** "Oct 2026" from an ISO date, or null if there isn't a usable one. */
function upcomingWhen(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

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

  async function load(force = false) {
    setError(false);
    try {
      setReport(await fetchReport(String(slug), force));
    } catch {
      setError(true);
    }
    try {
      const conn = await fetchConnectivity(String(slug), force);
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
    await load(true);
    setRefreshing(false);
  }

  async function onShare() {
    if (!report) return;
    try {
      await Share.share({
        message: `${report.locality.name}, ${report.locality.city} — Trust Score ${
          report.trust_score.score ?? "—"
        }/100 on Nestra.`,
      });
    } catch {
      /* dismissed */
    }
  }

  const ts = report?.trust_score;
  const available = report?.categories.filter((c) => c.available) ?? [];

  // Highlights and considerations are DERIVED from real scores, flags and nearby
  // counts — never hardcoded. A category only appears as a strength/weakness by
  // its own score; nearby facts come from the connectivity payload.
  const highlights: string[] = [];
  const considerations: string[] = [];
  for (const c of available) {
    if (c.score === null) continue;
    // Schools is an access measure, not a quality rating — so it is surfaced as
    // "plenty / few schools nearby", never "scores well (75)" or "scores poorly",
    // which would read as a verdict on schools we have no quality data for.
    if (c.category === "schools") {
      if (c.score >= 60) highlights.push(t("hl.schools"));
      else if (c.score < 30) considerations.push(t("con.schools"));
    } else if (c.score >= 75) {
      highlights.push(
        t("hl.strong")
          .replace("{cat}", categoryLabel(c.category, c.label))
          .replace("{n}", String(c.score)),
      );
    } else if (c.score < 55) {
      considerations.push(
        t("con.weak")
          .replace("{cat}", categoryLabel(c.category, c.label))
          .replace("{n}", String(c.score)),
      );
    }
  }
  if (nearby) {
    if ((nearby.hospitals ?? 0) > 0) highlights.push(t("hl.hospitals"));
    if ((nearby.parks ?? 0) > 0) highlights.push(t("hl.parks"));
    if ((nearby.metro_rail_stations ?? 0) > 0) highlights.push(t("hl.metro"));
  }
  if (ts && ts.categories_counted < ts.categories_total) {
    considerations.push(t("con.limited").replace("{n}", String(ts.categories_counted)));
  }
  // One simple pair: Pros and Cons. A modeled flood zone is a sharp con and
  // leads the list; being clear of one is a genuine reassurance and leads the
  // pros. The warning flags (power cuts, poor air) come next, ahead of the
  // softer category-derived lines, rather than living in a third section.
  const inFloodZone = !!report?.flood?.in_zone;
  const floodCon = inFloodZone ? [t("flood.con")] : [];
  const floodPro = report && !inFloodZone ? [t("flood.clear")] : [];
  const pros = [...highlights, ...floodPro];
  const cons = [...floodCon, ...(report?.flags ?? []).map((f) => f.headline), ...considerations];
  const prosTop = pros.slice(0, 6);
  const consTop = cons.slice(0, 6);

  return (
    <View style={styles.screen}>
      {/* Clean header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.topbar}>
          <View style={styles.topLeft}>
            <Link href="/" asChild>
              <Pressable hitSlop={8} style={styles.iconBtn}>
                <Icon name="back" size={20} color={theme.ink} />
              </Pressable>
            </Link>
            <View style={styles.brandMark}>
              <Icon name="heart" size={14} color="#ffffff" filled />
            </View>
            <Txt weight="extrabold" style={styles.brand}>
              {t("brand")}
            </Txt>
          </View>
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
                <View style={[styles.verdictPill, { backgroundColor: scoreColor(ts.score) + "1A" }]}>
                  <Txt weight="bold" style={[styles.verdictPillText, { color: scoreColor(ts.score) }]}>
                    {t(bandKey(ts.score))}
                  </Txt>
                </View>
                <Txt style={styles.verdict}>{report.verdict}</Txt>
                <Txt style={styles.basedOn}>
                  {t("report.basedOn")} {ts.categories_counted} {t("report.of")}{" "}
                  {ts.categories_total} {t("report.categories")}
                </Txt>
              </View>
            </Card>

            {/* Category score strip */}
            {available.length > 0 && (
              <View style={styles.section}>
                <Txt weight="bold" style={styles.sectionTitle}>
                  {t("overview.categoryScores")}
                </Txt>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.strip}
                >
                  {available.map((c) => {
                    const color = CAT_COLOR[c.category] ?? theme.brand;
                    const route = DETAIL_ROUTE[c.category];
                    const card = (
                      <View style={styles.stripCard}>
                        <View style={[styles.stripIcon, { backgroundColor: color + "1A" }]}>
                          <Icon name={categoryIcon(c.category)} size={18} color={color} />
                        </View>
                        <Txt weight="semibold" style={styles.stripLabel} numberOfLines={1}>
                          {categoryLabel(c.category, c.label)}
                        </Txt>
                        <Txt
                          weight="extrabold"
                          style={[styles.stripScore, { color: c.score !== null ? scoreColor(c.score) : theme.inkMuted }]}
                        >
                          {c.score ?? "—"}
                        </Txt>
                        <Txt style={styles.stripBand}>{t(categoryBandKey(c.category, c.score))}</Txt>
                      </View>
                    );
                    return route ? (
                      <Link
                        key={c.category}
                        href={`/${report.locality.slug}/${route}?score=${c.score ?? ""}`}
                        asChild
                      >
                        <PressableScale>{card}</PressableScale>
                      </Link>
                    ) : (
                      <View key={c.category}>{card}</View>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* More nearby — amenity coverage (counts, not scores) */}
            {nearby && ((nearby.hospitals ?? 0) > 0 || (nearby.parks ?? 0) > 0) && (
              <View style={styles.section}>
                <Txt weight="bold" style={styles.sectionTitle}>
                  {t("overview.amenities")}
                </Txt>
                <View style={styles.amenityRow}>
                  <Link href={`/${report.locality.slug}/healthcare`} asChild>
                    <PressableScale style={styles.amenityCard}>
                      <View style={[styles.amenityIcon, { backgroundColor: "#DC262618" }]}>
                        <Icon name="plus" size={18} color="#DC2626" />
                      </View>
                      <Txt weight="bold" style={styles.amenityLabel}>
                        {categoryLabel("healthcare", "Healthcare")}
                      </Txt>
                      <Txt style={styles.amenitySub}>
                        {t("health.nearbyCount").replace(
                          "{n}",
                          String((nearby.hospitals ?? 0) + (nearby.clinics ?? 0)),
                        )}
                      </Txt>
                    </PressableScale>
                  </Link>
                  <Link href={`/${report.locality.slug}/green-spaces`} asChild>
                    <PressableScale style={styles.amenityCard}>
                      <View style={[styles.amenityIcon, { backgroundColor: "#16A34A18" }]}>
                        <Icon name="tree" size={18} color="#16A34A" />
                      </View>
                      <Txt weight="bold" style={styles.amenityLabel}>
                        {categoryLabel("green_spaces", "Green spaces")}
                      </Txt>
                      <Txt style={styles.amenitySub}>
                        {t("green.nearbyCount").replace("{n}", String(nearby.parks ?? 0))}
                      </Txt>
                    </PressableScale>
                  </Link>
                </View>
              </View>
            )}

            {/* Pros — the simple good side, for a reader who wants it at a glance. */}
            {prosTop.length > 0 && (
              <View style={styles.section}>
                <Card style={[styles.noteCard, { backgroundColor: theme.goodSoft }]}>
                  <Txt weight="bold" style={styles.noteTitle}>
                    {t("overview.pros")}
                  </Txt>
                  {prosTop.map((h, i) => (
                    <View key={i} style={styles.noteRow}>
                      <View style={styles.noteIcon}>
                        <Icon name="check" size={13} color={theme.good} />
                      </View>
                      <Txt style={styles.noteText}>{h}</Txt>
                    </View>
                  ))}
                </Card>
              </View>
            )}

            {/* Cons — the warning flags (power cuts, poor air) lead, then the
              * softer category weaknesses. One list, plainly labelled. */}
            {consTop.length > 0 && (
              <View style={styles.section}>
                <Card style={[styles.noteCard, { backgroundColor: theme.warnSoft }]}>
                  <Txt weight="bold" style={styles.noteTitle}>
                    {t("overview.cons")}
                  </Txt>
                  {consTop.map((h, i) => (
                    <View key={i} style={styles.noteRow}>
                      <View style={styles.noteIcon}>
                        <Icon name="warning" size={13} color={theme.warn} />
                      </View>
                      <Txt style={styles.noteText}>{h}</Txt>
                    </View>
                  ))}
                </Card>
              </View>
            )}

            {/* Flood risk — only when the model shows a zone. The depth is a
              * modeled, ~1 km screening figure, said plainly, with the source
              * linked so a reader can check it. */}
            {report.flood?.in_zone && (
              <View style={styles.section}>
                <Txt weight="bold" style={styles.sectionTitle}>
                  {t("flood.title")}
                </Txt>
                <Card style={[styles.noteCard, { backgroundColor: theme.warnSoft }]}>
                  <Txt style={styles.noteText}>
                    {t("flood.line").replace(
                      "{depth}",
                      report.flood.depth_m != null ? report.flood.depth_m.toFixed(1) : "—",
                    )}
                  </Txt>
                  <Txt style={styles.upcomingMeta}>{t("flood.caveat")}</Txt>
                  <Pressable
                    onPress={() => void Linking.openURL(report.flood.source_url)}
                    style={{ marginTop: 2 }}
                  >
                    <Txt weight="semibold" style={styles.upcomingLink}>
                      {report.flood.source}  ↗
                    </Txt>
                  </Pressable>
                </Card>
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

            {/* Reported as coming — development the local press has written
              * about, each linked to its source so a reader can check it. These
              * are press reports, not commitments, which the title and the dated
              * source line make plain. */}
            {report.upcoming && report.upcoming.length > 0 && (
              <View style={styles.section}>
                <Txt weight="bold" style={styles.sectionTitle}>
                  {t("upcoming.title")}
                </Txt>
                <Txt style={styles.upcomingNote}>{t("upcoming.note")}</Txt>
                <Card style={styles.upcomingCard}>
                  {report.upcoming.map((item, i) => {
                    const when = upcomingWhen(item.published_at);
                    const meta = [item.source, when].filter(Boolean).join(" · ");
                    return (
                      <Pressable
                        key={i}
                        disabled={!item.url}
                        onPress={() => item.url && void Linking.openURL(item.url)}
                        style={[styles.upcomingRow, i > 0 && styles.upcomingRowDivider]}
                      >
                        <View style={styles.upcomingTag}>
                          <Txt weight="semibold" style={styles.upcomingTagText}>
                            {upcomingTag(item.kind, item.headline)}
                          </Txt>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Txt
                            weight="semibold"
                            style={[styles.upcomingHeadline, item.url && styles.upcomingLink]}
                          >
                            {item.headline}
                          </Txt>
                          {meta.length > 0 && (
                            <Txt style={styles.upcomingMeta}>
                              {meta}{item.url ? "  ↗" : ""}
                            </Txt>
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
                </Card>
              </View>
            )}

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
                  label={saved ? t("overview.saved") : t("overview.save")}
                  icon={saved ? "♥" : "♡"}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    toggle(String(slug));
                  }}
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
  topLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  brandMark: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: theme.brand,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
  brand: { fontSize: 15, color: theme.ink },
  topRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  iconBtn: { width: 38, height: 38, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  headerText: { marginTop: 8, paddingHorizontal: 4 },
  name: { fontSize: 26, color: theme.ink, letterSpacing: -0.5 },
  place: { fontSize: 13.5, color: theme.inkSecondary, marginTop: 2 },
  skelScore: { flexDirection: "row", alignItems: "center", gap: 18, marginTop: 8 },
  scoreCard: { flexDirection: "row", alignItems: "center", gap: 18, marginTop: 8 },
  verdictPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 8,
  },
  verdictPillText: { fontSize: 13 },
  verdict: { fontSize: 14, color: theme.ink, lineHeight: 20 },
  basedOn: { fontSize: 11, color: theme.inkMuted, marginTop: 8 },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 18, color: theme.ink, marginBottom: 12 },
  strip: { gap: 10, paddingRight: 4, paddingBottom: 2 },
  stripCard: {
    width: 96,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.hairline,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 3,
  },
  stripIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  stripLabel: { fontSize: 11.5, color: theme.inkSecondary, textAlign: "center" },
  stripScore: { fontSize: 22 },
  stripBand: { fontSize: 9.5, color: theme.inkMuted },
  amenityRow: { flexDirection: "row", gap: 12 },
  amenityCard: {
    flex: 1,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.hairline,
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  amenityIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  amenityLabel: { fontSize: 14, color: theme.ink },
  amenitySub: { fontSize: 11.5, color: theme.inkMuted, lineHeight: 16 },
  noteCard: { padding: 16, gap: 10 },
  noteTitle: { fontSize: 16, color: theme.ink, marginBottom: 2 },
  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  noteIcon: { marginTop: 1 },
  noteText: { flex: 1, fontSize: 13.5, color: theme.ink, lineHeight: 19 },
  upcomingNote: { fontSize: 12.5, color: theme.inkSecondary, marginTop: -6, marginBottom: 12, lineHeight: 18 },
  upcomingCard: { padding: 16, gap: 0 },
  upcomingRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 12 },
  upcomingRowDivider: { borderTopWidth: 1, borderTopColor: theme.hairline },
  upcomingTag: {
    marginTop: 1,
    backgroundColor: theme.brandSoft ?? theme.plane,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  upcomingTagText: { fontSize: 10.5, color: theme.brandDeep ?? theme.brand },
  upcomingHeadline: { fontSize: 13.5, color: theme.ink, lineHeight: 19 },
  upcomingLink: { color: theme.brandDeep ?? theme.brand },
  upcomingMeta: { fontSize: 11, color: theme.inkMuted, marginTop: 3 },
  actions: { flexDirection: "row", gap: 12, marginTop: 24 },
  sources: { marginTop: 24 },
  sourcesLabel: { fontSize: 10, color: theme.inkMuted },
  sourcesText: { fontSize: 12, color: theme.inkSecondary, marginTop: 4 },
});
