import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LanguageButton } from "@/components/LanguageButton";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Txt } from "@/components/ui/Txt";
import { useI18n } from "@/src/i18n";
import { cityCounts, useLocalities } from "@/src/useLocalities";
import { theme } from "@/src/theme";

const EXAMPLES = ["Koramangala", "560092", "Cyber Hub"];

export default function HomeScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data } = useLocalities();
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const cities = useMemo(() => (data ? cityCounts(data).slice(0, 6) : []), [data]);

  function goSearch(q?: string) {
    router.push({ pathname: "/search", params: q ? { q } : {} });
  }

  async function showNeighbourhood() {
    setLocError(null);
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocError(t("home.locationDenied"));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low,
      });
      const places = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const city = places[0]?.city || places[0]?.subregion || places[0]?.region;
      if (city) goSearch(city);
      else setLocError(t("home.locationError"));
    } catch {
      setLocError(t("home.locationError"));
    } finally {
      setLocating(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: 24,
        paddingHorizontal: 16,
      }}
    >
      <View style={styles.header}>
        <Txt weight="extrabold" style={styles.brand}>
          {t("brand")}
        </Txt>
        <LanguageButton />
      </View>

      <Txt weight="extrabold" style={styles.title}>
        {t("home.title")}
      </Txt>
      <Txt style={styles.subtitle}>{t("home.subtitle")}</Txt>

      <Pressable style={styles.searchBar} onPress={() => goSearch()}>
        <Icon name="search" size={20} color={theme.inkMuted} />
        <Txt style={styles.searchText}>{t("home.search")}</Txt>
      </Pressable>

      <View style={styles.examples}>
        <Txt weight="semibold" style={styles.examplesLabel}>
          {t("home.examplesLabel")}
        </Txt>
        {EXAMPLES.map((ex) => (
          <Pressable key={ex} onPress={() => goSearch(ex)}>
            <Txt weight="medium" style={styles.exampleChip}>
              {ex}
            </Txt>
          </Pressable>
        ))}
      </View>

      <View style={{ marginTop: 20 }}>
        <Button
          label={locating ? t("home.locating") : t("home.showNeighbourhood")}
          variant="secondary"
          icon="◎"
          disabled={locating}
          onPress={showNeighbourhood}
        />
        {locError && <Txt style={styles.locError}>{locError}</Txt>}
      </View>

      <View style={styles.sectionHead}>
        <Txt weight="bold" style={styles.sectionTitle}>
          {t("home.popularCities")}
        </Txt>
        <Pressable onPress={() => goSearch()} style={styles.browseAll} hitSlop={8}>
          <Txt weight="semibold" style={styles.browseAllText}>
            {t("home.browseAll")}
          </Txt>
          <Icon name="arrowRight" size={14} color={theme.brand} />
        </Pressable>
      </View>
      <View style={styles.grid}>
        {cities.map((c) => (
          <Pressable
            key={c.city}
            style={({ pressed }) => [styles.cityTile, pressed && styles.tilePressed]}
            onPress={() => goSearch(c.city)}
          >
            <View style={styles.cityIcon}>
              <Icon name="building" size={20} color={theme.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt weight="bold" style={styles.cityName} numberOfLines={1}>
                {c.city}
              </Txt>
              <Txt weight="medium" style={styles.cityCount}>
                {c.count} {t("common.localities")}
              </Txt>
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.page },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  brand: { fontSize: 18, color: theme.brand },
  title: { fontSize: 30, color: theme.ink, letterSpacing: -0.6, lineHeight: 36 },
  subtitle: { fontSize: 15, color: theme.inkSecondary, marginTop: 8, lineHeight: 22 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 20,
    backgroundColor: theme.surface,
    borderWidth: 1.5,
    borderColor: theme.hairline,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  searchText: { fontSize: 15, color: theme.inkMuted },
  examples: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  examplesLabel: { fontSize: 13, color: theme.inkMuted },
  exampleChip: {
    fontSize: 13,
    color: theme.brandDeep,
    backgroundColor: theme.brandSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: "hidden",
  },
  locError: { fontSize: 12, color: theme.bad, marginTop: 8 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 28,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, color: theme.ink },
  browseAll: { flexDirection: "row", alignItems: "center", gap: 3 },
  browseAllText: { fontSize: 13, color: theme.brand },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  cityTile: {
    width: "47.5%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.hairline,
    borderRadius: 16,
    padding: 14,
  },
  cityIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: theme.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  tilePressed: { backgroundColor: theme.plane },
  cityName: { fontSize: 15, color: theme.ink },
  cityCount: { fontSize: 12, color: theme.inkMuted, marginTop: 2 },
});
