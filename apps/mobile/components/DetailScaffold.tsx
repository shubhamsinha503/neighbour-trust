import { Link } from "expo-router";
import type { ReactNode } from "react";
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
            <Text style={styles.back}>← {t("report.back")}</Text>
          </Pressable>
        </Link>
        <LanguageButton />
      </View>
      <Text style={styles.title}>{title}</Text>

      {state === "loading" && (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.brand} />
      )}
      {state === "nodata" && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("detail.noData")}</Text>
          {reason ? <Text style={styles.reason}>{reason}</Text> : null}
        </View>
      )}
      {state === "error" && (
        <Pressable onPress={onRetry} style={styles.card}>
          <Text style={styles.reason}>{t("report.loadError")}</Text>
        </Pressable>
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
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
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
      {headline ? <Text style={styles.verdict}>{headline}</Text> : null}
      <View style={styles.metaRow}>
        {confLabel ? (
          <Text style={styles.meta}>
            {t("detail.confidence")}: {confLabel}
          </Text>
        ) : null}
        {source ? (
          <Text style={styles.meta}>
            {t("detail.source")}: {source}
          </Text>
        ) : null}
      </View>
      {vintage ? (
        <Text style={styles.meta}>
          {t("detail.asOf")} {new Date(vintage).toLocaleDateString()}
        </Text>
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
