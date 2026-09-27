import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LanguageButton } from "@/components/LanguageButton";
import { Button } from "@/components/ui/Button";
import { CityBadge } from "@/components/ui/CityBadge";
import { CityIllustration } from "@/components/ui/CityIllustration";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PressableScale } from "@/components/ui/PressableScale";
import { Txt } from "@/components/ui/Txt";
import { useI18n } from "@/src/i18n";
import { cityCounts, useLocalities } from "@/src/useLocalities";
import { radius, theme } from "@/src/theme";

const EXAMPLES = ["Koramangala", "Indiranagar", "Whitefield", "560001", "HSR Layout"];

// "What matters" grid — glyph + accent + sub-label key. Route: most open Explore;
// Sun & Shadow opens the Map picker. Healthcare/Green Spaces surface real nearby
// facts on the report; none invent scores.
const CATEGORIES: Array<{ key: string; sub: string; icon: IconName; color: string; route: "/search" | "/map" }> = [
  { key: "cat.crime", sub: "catsub.crime", icon: "shield", color: "#F72575", route: "/search" },
  { key: "cat.air_quality", sub: "catsub.air_quality", icon: "leaf", color: "#1B9362", route: "/search" },
  { key: "cat.water", sub: "catsub.water", icon: "drop", color: "#06B6D4", route: "/search" },
  { key: "cat.infrastructure", sub: "catsub.infrastructure", icon: "bus", color: "#7C3AED", route: "/search" },
  { key: "cat.schools", sub: "catsub.schools", icon: "book", color: "#2563EB", route: "/search" },
  { key: "cat.healthcare", sub: "catsub.healthcare", icon: "plus", color: "#DC2626", route: "/search" },
  { key: "cat.green_spaces", sub: "catsub.green_spaces", icon: "tree", color: "#16A34A", route: "/search" },
  { key: "cat.sun", sub: "catsub.sun", icon: "sun", color: "#EA580C", route: "/map" },
];

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

  // A known city from the rail filters Explore by the city chip (clearable via
  // "All cities"), rather than seeding free text the user must delete by hand.
  function goCity(city: string) {
    router.push({ pathname: "/search", params: { city } });
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
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
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
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 0 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Decorative pink blobs */}
      <View pointerEvents="none" style={styles.blobs}>
        <View style={[styles.blob, { width: 240, height: 240, top: -80, right: -70, backgroundColor: theme.brandSoft }]} />
        <View style={[styles.blob, { width: 150, height: 150, top: 30, left: -55, backgroundColor: "#FFE1EE" }]} />
      </View>

      <View style={styles.body}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Icon name="heart" size={16} color="#ffffff" filled />
            </View>
            <Txt weight="extrabold" style={styles.brand}>
              {t("brand")}
            </Txt>
          </View>
          <LanguageButton />
        </View>

        <View style={styles.eyebrow}>
          <Txt weight="extrabold" style={styles.eyebrowText}>
            {t("home.eyebrow")}
          </Txt>
        </View>

        <Txt weight="extrabold" style={styles.title}>
          {t("home.title")}
        </Txt>
        <Txt style={styles.subtitle}>{t("home.subtitle")}</Txt>

        <PressableScale style={styles.searchBar} onPress={() => goSearch()}>
          <Icon name="search" size={20} color={theme.inkMuted} />
          <Txt style={styles.searchText}>{t("home.search")}</Txt>
        </PressableScale>

        <View style={styles.examples}>
          <Txt weight="semibold" style={styles.examplesLabel}>
            {t("home.examplesLabel")}
          </Txt>
          {EXAMPLES.map((ex) => (
            <PressableScale
              key={ex}
              onPress={() => {
                void Haptics.selectionAsync();
                goSearch(ex);
              }}
            >
              <Txt weight="medium" style={styles.exampleChip}>
                {ex}
              </Txt>
            </PressableScale>
          ))}
        </View>

        <View style={styles.cta}>
          <Button
            label={locating ? t("home.locating") : t("home.showNeighbourhood")}
            icon="◎"
            disabled={locating}
            onPress={showNeighbourhood}
          />
          {locError && <Txt style={styles.locError}>{locError}</Txt>}
        </View>

        {/* Popular cities rail */}
        <View style={styles.sectionHead}>
          <Txt weight="bold" style={styles.sectionTitle}>
            {t("home.popularCities")}
          </Txt>
          <PressableScale onPress={() => goSearch()} style={styles.viewAll} hitSlop={8}>
            <Txt weight="semibold" style={styles.viewAllText}>
              {t("home.browseAll")}
            </Txt>
            <Icon name="arrowRight" size={14} color={theme.brand} />
          </PressableScale>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        {cities.map((c, i) => (
          <PressableScale
            key={c.city}
            style={styles.cityCard}
            onPress={() => {
              void Haptics.selectionAsync();
              goCity(c.city);
            }}
          >
            <View style={styles.cityBadgeWrap}>
              <CityBadge variant={i} height={74} />
            </View>
            <Txt weight="bold" style={styles.cityName} numberOfLines={1}>
              {c.city}
            </Txt>
            <Txt weight="medium" style={styles.cityCount}>
              {c.count} {t("common.localities")}
            </Txt>
          </PressableScale>
        ))}
      </ScrollView>

      {/* What matters grid */}
      <View style={styles.body}>
        <Txt weight="bold" style={[styles.sectionTitle, { marginTop: 26 }]}>
          {t("home.whatMatters")}
        </Txt>
        <Txt style={styles.whatSub}>{t("home.whatMattersSub")}</Txt>
        <View style={styles.grid}>
          {CATEGORIES.map((c) => (
            <PressableScale
              key={c.key}
              style={styles.catTile}
              onPress={() => {
                void Haptics.selectionAsync();
                router.push(c.route);
              }}
            >
              <View style={[styles.catIcon, { backgroundColor: c.color + "1F" }]}>
                <Icon name={c.icon} size={20} color={c.color} />
              </View>
              <Txt weight="bold" style={styles.catLabel} numberOfLines={1}>
                {t(c.key)}
              </Txt>
              <Txt style={styles.catSub} numberOfLines={1}>
                {t(c.sub)}
              </Txt>
            </PressableScale>
          ))}
        </View>
      </View>

      <CityIllustration height={210} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.page },
  blobs: { position: "absolute", top: 0, left: 0, right: 0, height: 340 },
  blob: { position: "absolute", borderRadius: 999, opacity: 0.7 },
  body: { paddingHorizontal: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandMark: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: theme.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { fontSize: 17, color: theme.ink },
  eyebrow: {
    alignSelf: "flex-start",
    backgroundColor: theme.brandSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },
  eyebrowText: { fontSize: 11, letterSpacing: 0.6, color: theme.brandDeep },
  title: { fontSize: 33, color: theme.ink, letterSpacing: -0.8, lineHeight: 38 },
  subtitle: { fontSize: 14.5, color: theme.inkSecondary, marginTop: 10, lineHeight: 21 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 18,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.hairline,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 15,
    shadowColor: "#10213A",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  searchText: { fontSize: 15, color: theme.inkMuted },
  examples: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 14 },
  examplesLabel: { fontSize: 13, color: theme.inkMuted },
  exampleChip: {
    fontSize: 13,
    color: theme.inkSecondary,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.hairline,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    overflow: "hidden",
  },
  cta: { marginTop: 18 },
  locError: { fontSize: 12, color: theme.bad, marginTop: 8 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 26,
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 18, color: theme.ink },
  viewAll: { flexDirection: "row", alignItems: "center", gap: 3 },
  viewAllText: { fontSize: 13, color: theme.brand },
  rail: { paddingHorizontal: 16, gap: 12, paddingBottom: 4 },
  cityCard: {
    width: 132,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.hairline,
    borderRadius: radius.lg,
    overflow: "hidden",
    paddingBottom: 12,
  },
  cityBadgeWrap: { height: 74 },
  cityName: { fontSize: 14, color: theme.ink, marginTop: 10, paddingHorizontal: 12 },
  cityCount: { fontSize: 11.5, color: theme.inkMuted, marginTop: 2, paddingHorizontal: 12 },
  whatSub: { fontSize: 13.5, color: theme.inkSecondary, marginTop: 4, marginBottom: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  catTile: {
    width: "22%",
    flexGrow: 1,
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.hairline,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  catIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  catLabel: { fontSize: 11.5, color: theme.ink, textAlign: "center" },
  catSub: { fontSize: 9.5, color: theme.inkMuted, textAlign: "center" },
});
