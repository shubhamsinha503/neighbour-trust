import { Link, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ShadowMapView } from "@/components/ShadowMapView";
import { Icon } from "@/components/ui/Icon";
import { Txt } from "@/components/ui/Txt";
import { fetchReport } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { theme } from "@/src/theme";

/**
 * The Sun & Shadow map for one locality, full screen. It can be opened with the
 * coordinates already in hand (from the report's Sunlight card) or with just the
 * slug (from the Map tab's picker), in which case it fetches the report to learn
 * where the locality is.
 */
export default function SunlightScreen() {
  const params = useLocalSearchParams<{
    slug: string;
    lat?: string;
    lon?: string;
    name?: string;
  }>();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const paramLat = params.lat != null ? Number(params.lat) : NaN;
  const paramLon = params.lon != null ? Number(params.lon) : NaN;
  const hasCoords = Number.isFinite(paramLat) && Number.isFinite(paramLon);

  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(
    hasCoords ? { lat: paramLat, lon: paramLon } : null,
  );
  const [name, setName] = useState<string>(params.name ?? "");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (coords) return;
    let cancelled = false;
    fetchReport(String(params.slug))
      .then((r) => {
        if (cancelled) return;
        setCoords({ lat: r.locality.lat, lon: r.locality.lon });
        setName(r.locality.name);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [params.slug, coords]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topbar}>
        <Link href={`/${params.slug}`} asChild>
          <Pressable hitSlop={8} style={styles.back}>
            <Icon name="back" size={20} color={theme.inkSecondary} />
            <Txt style={styles.backText}>{t("report.back")}</Txt>
          </Pressable>
        </Link>
        <Txt weight="bold" style={styles.title} numberOfLines={1}>
          {name || t("sun.header")}
        </Txt>
        <View style={styles.spacer} />
      </View>

      {error && (
        <View style={styles.center}>
          <Txt style={styles.errorText}>{t("report.loadError")}</Txt>
        </View>
      )}

      {!error && !coords && (
        <View style={styles.center}>
          <ActivityIndicator color={theme.brand} />
        </View>
      )}

      {!error && coords && (
        <ShadowMapView lat={coords.lat} lon={coords.lon} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.page },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  back: { flexDirection: "row", alignItems: "center", gap: 2, width: 88 },
  backText: { fontSize: 13, color: theme.inkSecondary },
  title: { flex: 1, fontSize: 16, color: theme.ink, textAlign: "center" },
  spacer: { width: 88 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { fontSize: 14, color: theme.inkMuted },
});
