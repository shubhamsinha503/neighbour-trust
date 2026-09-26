import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "@/components/ui/Icon";
import { Txt } from "@/components/ui/Txt";
import { useI18n } from "@/src/i18n";
import { theme } from "@/src/theme";

/**
 * Placeholder for the interactive sun-and-shadow map. The map needs a native dev
 * build, so it ships after the Expo Go foundation; until then every locality
 * report still carries its full sunlight breakdown, which this screen points to.
 */
export default function MapScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <Txt weight="extrabold" style={styles.title}>
        {t("map.title")}
      </Txt>

      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Icon name="map" size={34} color={theme.brand} />
        </View>
        <Txt weight="bold" style={styles.soonTitle}>
          {t("map.soonTitle")}
        </Txt>
        <Txt style={styles.soonText}>{t("map.soonText")}</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.page, paddingHorizontal: 16 },
  title: { fontSize: 26, color: theme.ink, letterSpacing: -0.5, marginBottom: 12 },
  body: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingBottom: 60 },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 999,
    backgroundColor: theme.brandSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  soonTitle: { fontSize: 19, color: theme.ink, marginBottom: 10 },
  soonText: { fontSize: 14, color: theme.inkMuted, textAlign: "center", lineHeight: 21 },
});
