import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LanguageButton } from "@/components/LanguageButton";
import { Icon, type IconName } from "@/components/ui/Icon";
import { LocalityCard } from "@/components/ui/LocalityCard";
import { LocalityThumb } from "@/components/ui/LocalityThumb";
import { PressableScale } from "@/components/ui/PressableScale";
import { Txt } from "@/components/ui/Txt";
import { useI18n } from "@/src/i18n";
import { useLocalities } from "@/src/useLocalities";
import { theme } from "@/src/theme";

const EXAMPLES = ["Koramangala", "560092", "Cyber Hub"];

// Category → glyph + accent. Healthcare/Green Spaces surface real nearby counts
// on the report; none of these invent scores.
const CATEGORIES: Array<{ key: string; icon: IconName; color: string; route: "/search" | "/map" }> = [
  { key: "cat.crime", icon: "shield", color: "#F72575", route: "/search" },
  { key: "cat.air_quality", icon: "leaf", color: "#1B9362", route: "/search" },
  { key: "cat.schools", icon: "book", color: "#2563EB", route: "/search" },
  { key: "cat.healthcare", icon: "plus", color: "#DC2626", route: "/search" },
  { key: "cat.water", icon: "drop", color: "#06B6D4", route: "/search" },
  { key: "cat.infrastructure", icon: "bus", color: "#7C3AED", route: "/search" },
  { key: "cat.green_spaces", icon: "tree", color: "#16A34A", route: "/search" },
  { key: "cat.sun", icon: "sun", color: "#EA580C", route: "/map" },
];

export default function HomeScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data } = useLocalities();
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  // "Popular near you" — best-scored localities we actually have data for.
  const popular = useMemo(() => {
    if (!data) return [];
    return [...data]
      .filter((l) => l.score !== null)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 10);
  }, [data]);

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
      contentContainerStyle={{ paddingBottom: 28 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <LinearGradient
        colors={["#FFE1EE", "#F7F8FA"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 14 }]}
      >
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Icon name="location" size={16} color="#ffffff" />
            </View>
            <Txt weight="extrabold" style={styles.brand}>
              {t("brand")}
            </Txt>
          </View>
          <LanguageButton />
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
          <PressableScale onPress={showNeighbourhood} style={styles.locateChip}>
            <Icon name="location" size={13} color={theme.brandDeep} />
            <Txt weight="semibold" style={styles.locateText}>
              {locating ? t("home.locating") : t("home.showNeighbourhood")}
            </Txt>
          </PressableScale>
        </View>
        {locError && <Txt style={styles.locError}>{locError}</Txt>}
      </LinearGradient>

      {/* Popular near you */}
      <View style={styles.sectionHead}>
        <Txt weight="bold" style={styles.sectionTitle}>
          {t("home.popularNear")}
        </Txt>
        <PressableScale onPress={() => goSearch()} style={styles.viewAll} hitSlop={8}>
          <Txt weight="semibold" style={styles.viewAllText}>
            {t("home.viewAll")}
          </Txt>
          <Icon name="arrowRight" size={14} color={theme.brand} />
        </PressableScale>
      </View>
      <FlatList
        data={popular}
        keyExtractor={(l) => l.slug}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        renderItem={({ item }) => <LocalityCard item={item} />}
        ListEmptyComponent={
          <View style={styles.railSkeletons}>
            {Array.from({ length: 3 }).map((_, i) => (
              <View key={i} style={styles.railSkel}>
                <LocalityThumb seed={`skel${i}`} label="·" style={{ height: 96 }} radius={0} />
              </View>
            ))}
          </View>
        }
      />

      {/* Category grid */}
      <Txt weight="bold" style={[styles.sectionTitle, styles.gridTitle]}>
        {t("home.exploreByCategory")}
      </Txt>
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
              <Icon name={c.icon} size={22} color={c.color} />
            </View>
            <Txt weight="semibold" style={styles.catLabel} numberOfLines={2}>
              {t(c.key)}
            </Txt>
          </PressableScale>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.page },
  hero: {
    paddingHorizontal: 16,
    paddingBottom: 22,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandMark: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: theme.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { fontSize: 17, color: theme.ink },
  title: { fontSize: 30, color: theme.ink, letterSpacing: -0.7, lineHeight: 35 },
  subtitle: { fontSize: 14.5, color: theme.inkSecondary, marginTop: 8, lineHeight: 21 },
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
    color: theme.brandDeep,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.brandLight,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    overflow: "hidden",
  },
  locateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: theme.brandSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  locateText: { fontSize: 13, color: theme.brandDeep },
  locError: { fontSize: 12, color: theme.bad, marginTop: 8 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 22,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, color: theme.ink },
  gridTitle: { paddingHorizontal: 16, marginTop: 26, marginBottom: 14 },
  viewAll: { flexDirection: "row", alignItems: "center", gap: 3 },
  viewAllText: { fontSize: 13, color: theme.brand },
  rail: { paddingHorizontal: 16, gap: 12 },
  railSkeletons: { flexDirection: "row", gap: 12, paddingLeft: 0 },
  railSkel: {
    width: 168,
    height: 150,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.hairline,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    gap: 12,
  },
  catTile: {
    width: "22%",
    flexGrow: 1,
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.hairline,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 6,
  },
  catIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  catLabel: { fontSize: 11.5, color: theme.ink, textAlign: "center", lineHeight: 15 },
});
