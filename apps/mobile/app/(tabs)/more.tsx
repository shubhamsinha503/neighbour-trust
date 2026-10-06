import Constants from "expo-constants";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LanguageButton } from "@/components/LanguageButton";
import { Card } from "@/components/ui/Card";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Txt } from "@/components/ui/Txt";
import { API_BASE } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { theme } from "@/src/theme";

/**
 * Each source row is one category and the public dataset behind it, kept in the
 * same honest language as the per-card source tags and the web "About" page.
 * Proper nouns (CPCB, OpenStreetMap, WRI Aqueduct Floods) are not translated.
 */
const SOURCES: { icon: IconName; title: string; from: string }[] = [
  { icon: "leaf", title: "more.srcAir", from: "more.srcAirFrom" },
  { icon: "building", title: "more.srcPlaces", from: "more.srcPlacesFrom" },
  { icon: "shield", title: "more.srcSafety", from: "more.srcSafetyFrom" },
  { icon: "drop", title: "more.srcFlood", from: "more.srcFloodFrom" },
  { icon: "sun", title: "more.srcSun", from: "more.srcSunFrom" },
];

export default function MoreScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const version = Constants.expoConfig?.version ?? "0.1.0";
  // Host only, not the full URL — enough to tell prod from a dev API at a glance.
  const host = API_BASE.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 32,
        paddingHorizontal: 16,
      }}
    >
      <Txt weight="extrabold" style={styles.title}>
        {t("more.title")}
      </Txt>

      {/* Language */}
      <Card style={styles.card}>
        <Txt weight="semibold" style={styles.label}>
          {t("more.language")}
        </Txt>
        <View style={styles.langRow}>
          <LanguageButton />
        </View>
      </Card>

      {/* About */}
      <Card style={styles.card}>
        <Txt weight="bold" style={styles.aboutTitle}>
          {t("more.about")}
        </Txt>
        <Txt style={styles.aboutText}>{t("more.aboutText")}</Txt>
      </Card>

      {/* Where the data comes from */}
      <Card style={styles.card}>
        <Txt weight="semibold" style={styles.label}>
          {t("more.sourcesTitle")}
        </Txt>
        <Txt style={styles.sourcesIntro}>{t("more.sourcesIntro")}</Txt>

        <View style={styles.sourceList}>
          {SOURCES.map((s, i) => (
            <View
              key={s.title}
              style={[styles.sourceRow, i > 0 && styles.sourceRowDivider]}
            >
              <View style={styles.sourceIcon}>
                <Icon name={s.icon} size={18} color={theme.brand} />
              </View>
              <View style={styles.sourceBody}>
                <Txt weight="semibold" style={styles.sourceTitle}>
                  {t(s.title)}
                </Txt>
                <Txt style={styles.sourceFrom}>{t(s.from)}</Txt>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.noteRow}>
          <Icon name="info" size={15} color={theme.inkMuted} />
          <Txt style={styles.note}>{t("more.sourcesNote")}</Txt>
        </View>
      </Card>

      {/* Footer */}
      <View style={styles.footer}>
        <Txt weight="semibold" style={styles.footerApp}>
          {t("more.version").replace("{version}", version)}
        </Txt>
        <Txt style={styles.footerHost}>{host}</Txt>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.page },
  title: { fontSize: 26, color: theme.ink, letterSpacing: -0.5, marginBottom: 16 },
  card: { marginBottom: 14 },
  label: {
    fontSize: 11,
    color: theme.inkMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  langRow: { flexDirection: "row" },
  aboutTitle: { fontSize: 17, color: theme.ink, marginBottom: 8 },
  aboutText: { fontSize: 14, color: theme.inkSecondary, lineHeight: 21 },

  sourcesIntro: {
    fontSize: 13.5,
    color: theme.inkSecondary,
    lineHeight: 20,
    marginTop: -2,
    marginBottom: 6,
  },
  sourceList: { marginTop: 4 },
  sourceRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 12 },
  sourceRowDivider: { borderTopWidth: 1, borderTopColor: theme.hairline },
  sourceIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: theme.brandSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  sourceBody: { flex: 1 },
  sourceTitle: { fontSize: 14.5, color: theme.ink, marginBottom: 3 },
  sourceFrom: { fontSize: 12.5, color: theme.inkSecondary, lineHeight: 18 },

  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.hairline,
  },
  note: { flex: 1, fontSize: 12, color: theme.inkMuted, lineHeight: 18 },

  footer: { alignItems: "center", marginTop: 10, gap: 3 },
  footerApp: { fontSize: 12.5, color: theme.inkMuted },
  footerHost: { fontSize: 11, color: theme.inkMuted, opacity: 0.7 },
});
