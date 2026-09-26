import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LanguageButton } from "@/components/LanguageButton";
import { Card } from "@/components/ui/Card";
import { Txt } from "@/components/ui/Txt";
import { API_BASE } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { theme } from "@/src/theme";

export default function MoreScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  // Show the host only, not the full URL — enough to tell prod from a dev API.
  const host = API_BASE.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 16,
      }}
    >
      <Txt weight="extrabold" style={styles.title}>
        {t("more.title")}
      </Txt>

      <Card style={styles.card}>
        <Txt weight="semibold" style={styles.label}>
          {t("more.language")}
        </Txt>
        <View style={styles.langRow}>
          <LanguageButton />
        </View>
      </Card>

      <Card style={styles.card}>
        <Txt weight="bold" style={styles.aboutTitle}>
          {t("more.about")}
        </Txt>
        <Txt style={styles.aboutText}>{t("more.aboutText")}</Txt>
      </Card>

      <Card style={styles.card}>
        <Txt weight="semibold" style={styles.label}>
          {t("more.dataSource")}
        </Txt>
        <Txt style={styles.host}>{host}</Txt>
      </Card>
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
  host: { fontSize: 14, color: theme.ink },
});
