import { useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

import { Txt } from "@/components/ui/Txt";
import { shadowMapHtml } from "@/components/shadowMapHtml";
import { useI18n } from "@/src/i18n";
import { theme } from "@/src/theme";

/**
 * Hosts the Sun & Shadow map (MapLibre + turf, all inside the WebView). The map
 * needs the network for tiles and the CDN libraries, so a slow or blocked link
 * shows the WebView's own loading state, then the map. Runs in Expo Go — the
 * WebView is the one heavy native module Expo Go already bundles.
 */
export function ShadowMapView({ lat, lon }: { lat: number; lon: number }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const html = useMemo(
    () =>
      shadowMapHtml({
        lat,
        lon,
        labels: {
          missingHeights: t("shadow.missingHeights"),
          beforeAfter: t("shadow.beforeAfter"),
          sunAbove: t("shadow.sunAbove"),
          loading: t("shadow.loading"),
        },
      }),
    [lat, lon, t],
  );

  if (failed) {
    return (
      <View style={styles.fallback}>
        <Txt style={styles.fallbackText}>{t("shadow.failed")}</Txt>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <WebView
        originWhitelist={["*"]}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
        onLoadEnd={() => setLoading(false)}
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
        style={styles.web}
        // Android: allow the CDN + tile requests over the default (https) scheme.
        mixedContentMode="always"
      />
      {loading && (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={theme.brand} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.page },
  web: { flex: 1, backgroundColor: theme.page },
  loading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  fallback: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  fallbackText: { fontSize: 14, color: theme.inkMuted, textAlign: "center", lineHeight: 20 },
});
