import { Link } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LanguageButton } from "@/components/LanguageButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Txt } from "@/components/ui/Txt";
import { useI18n } from "@/src/i18n";
import { theme } from "@/src/theme";

/** Shared chrome for the three category detail screens: back link, title,
 *  loading / no-data / error states. The screen supplies the loaded body. */
export function DetailScaffold({
  slug,
  title,
  state,
  reason,
  onRetry,
  children,
}: {
  slug: string;
  title: string;
  state: "loading" | "nodata" | "error" | "ready";
  reason?: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
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
        <Link href={`/${slug}`} asChild>
          <Pressable>
            <Txt style={styles.back}>← {t("report.back")}</Txt>
          </Pressable>
        </Link>
        <LanguageButton />
      </View>
      <Txt weight="extrabold" style={styles.title}>
        {title}
      </Txt>

      {state === "loading" && (
        <View style={{ marginTop: 8 }}>
          <View style={styles.skelHero}>
            <Skeleton style={{ width: 96, height: 96, borderRadius: 999 }} />
            <View style={{ flex: 1, gap: 8 }}>
              <Skeleton style={{ width: "40%", height: 12 }} />
              <Skeleton style={{ width: "100%", height: 14 }} />
              <Skeleton style={{ width: "75%", height: 14 }} />
            </View>
          </View>
          <View style={styles.skelGrid}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} style={{ flexBasis: "47%", flexGrow: 1, height: 78, borderRadius: 16 }} />
            ))}
          </View>
        </View>
      )}
      {state === "nodata" && (
        <EmptyState icon="info" title={t("detail.noData")} message={reason ?? ""} />
      )}
      {state === "error" && (
        <EmptyState
          icon="warning"
          title={t("detail.noData")}
          message={t("report.loadError")}
          actionLabel={t("common.retry")}
          onAction={onRetry}
        />
      )}
      {state === "ready" && children}
    </ScrollView>
  );
}

/** A labelled value row used across the detail screens. */
export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <View style={styles.stat}>
      <Txt weight="semibold" style={styles.statLabel}>
        {label}
      </Txt>
      <Txt weight="extrabold" style={styles.statValue}>
        {value}
      </Txt>
      {sub ? <Txt style={styles.statSub}>{sub}</Txt> : null}
    </View>
  );
}

/** The API-generated verdict headline (English for now), plus source + date. */
export function VerdictBlock({
  headline,
  confidence,
  source,
  vintage,
}: {
  headline?: string;
  confidence?: string;
  source?: string;
  vintage?: string;
}) {
  const { t } = useI18n();
  const confLabel =
    confidence && t("conf." + confidence) !== "conf." + confidence
      ? t("conf." + confidence)
      : confidence;
  return (
    <View style={styles.card}>
      {headline ? (
        <Txt weight="semibold" style={styles.verdict}>
          {headline}
        </Txt>
      ) : null}
      <View style={styles.metaRow}>
        {confLabel ? (
          <Txt style={styles.meta}>
            {t("detail.confidence")}: {confLabel}
          </Txt>
        ) : null}
        {source ? (
          <Txt style={styles.meta}>
            {t("detail.source")}: {source}
          </Txt>
        ) : null}
      </View>
      {vintage ? (
        <Txt style={styles.meta}>
          {t("detail.asOf")} {new Date(vintage).toLocaleDateString()}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.page },
  back: { fontSize: 12, color: theme.inkMuted },
  topbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  title: {
    fontSize: 23,
    fontWeight: "800",
    color: theme.ink,
    marginTop: 4,
    marginBottom: 12,
  },
  skelHero: { flexDirection: "row", alignItems: "center", gap: 18, marginTop: 8 },
  skelGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 18 },
  card: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: theme.hairline,
    backgroundColor: theme.surface,
    borderRadius: 20,
    padding: 18,
  },
  cardTitle: { fontSize: 14, fontWeight: "700", color: theme.ink },
  reason: {
    fontSize: 12.5,
    color: theme.inkSecondary,
    marginTop: 6,
    lineHeight: 18,
  },
  verdict: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.ink,
    lineHeight: 21,
  },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 },
  meta: { fontSize: 11, color: theme.inkMuted },
  stat: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: theme.plane,
    borderRadius: 16,
    padding: 14,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    color: theme.inkMuted,
    letterSpacing: 0.4,
  },
  statValue: { fontSize: 20, fontWeight: "800", color: theme.ink, marginTop: 4 },
  statSub: { fontSize: 10.5, color: theme.inkSecondary, marginTop: 2 },
});
