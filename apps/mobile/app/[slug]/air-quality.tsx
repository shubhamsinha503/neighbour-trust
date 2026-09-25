import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { DetailScaffold, Stat, VerdictBlock } from "@/components/DetailScaffold";
import { fetchAirQuality, NoDataError, type AirQualityDetail } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { scoreColor, theme } from "@/src/theme";

export default function AirQualityScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, categoryLabel } = useI18n();
  const [data, setData] = useState<AirQualityDetail | null>(null);
  const [state, setState] = useState<"loading" | "nodata" | "error" | "ready">(
    "loading",
  );
  const [reason, setReason] = useState<string>();

  const load = useCallback(async () => {
    setState("loading");
    try {
      setData(await fetchAirQuality(String(slug)));
      setState("ready");
    } catch (e) {
      if (e instanceof NoDataError) {
        setReason(e.reason);
        setState("nodata");
      } else setState("error");
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const p = data?.payload;

  return (
    <DetailScaffold
      slug={String(slug)}
      title={categoryLabel("air_quality", "Air quality")}
      state={state}
      reason={reason}
      onRetry={load}
    >
      {p && (
        <>
          <View style={styles.hero}>
            <Text style={[styles.aqi, { color: scoreColor(100 - p.current_aqi) }]}>
              {Math.round(p.current_aqi)}
            </Text>
            <Text style={styles.band}>{data?.verdict?.band_label}</Text>
          </View>
          <VerdictBlock
            headline={data?.verdict?.headline}
            confidence={data?.confidence}
            source={data?.source_name}
            vintage={data?.data_vintage}
          />
          <View style={styles.grid}>
            <Stat label={t("aq.aqi")} value={String(Math.round(p.current_aqi))} />
            {p.latest_hour_aqi !== undefined && (
              <Stat
                label={t("aq.latestHour")}
                value={String(Math.round(p.latest_hour_aqi))}
              />
            )}
            {p.pm2_5 !== undefined && <Stat label="PM2.5" value={String(p.pm2_5)} />}
            {p.pm10 !== undefined && <Stat label="PM10" value={String(p.pm10)} />}
            {p.no2 !== undefined && <Stat label="NO₂" value={String(p.no2)} />}
            {p.o3 !== undefined && <Stat label="O₃" value={String(p.o3)} />}
            {p.dominant_pollutant && (
              <Stat label={t("aq.dominant")} value={p.dominant_pollutant} />
            )}
            {p.station_name && (
              <Stat
                label={t("aq.station")}
                value={p.station_name}
                sub={
                  p.nearest_station_km !== undefined
                    ? `${p.nearest_station_km.toFixed(1)} ${t("aq.km")}`
                    : undefined
                }
              />
            )}
          </View>
        </>
      )}
    </DetailScaffold>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", marginVertical: 8 },
  aqi: { fontSize: 56, fontWeight: "800" },
  band: { fontSize: 14, fontWeight: "600", color: theme.inkSecondary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
});
