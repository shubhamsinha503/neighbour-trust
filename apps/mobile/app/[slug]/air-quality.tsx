import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { DetailScaffold, Stat } from "@/components/DetailScaffold";
import { Card } from "@/components/ui/Card";
import { ConfidenceTag } from "@/components/ui/ConfidenceTag";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { Txt } from "@/components/ui/Txt";
import { fetchAirQuality, NoDataError, type AirQualityDetail } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { theme } from "@/src/theme";

export default function AirQualityScreen() {
  const { slug, score } = useLocalSearchParams<{ slug: string; score?: string }>();
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
  // The category score comes in as a route param from the overview card; it's the
  // 0–100 figure the ring shows. AQI itself is a separate stat below.
  const catScore = score != null && score !== "" ? Number(score) : null;
  const modelled = /model/i.test(data?.source_name ?? "");

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
          {/* Score card — ring + our take */}
          <Card style={styles.takeCard}>
            <ScoreBadge score={catScore} size="lg" showOutOf />
            <View style={{ flex: 1 }}>
              <Txt weight="bold" style={styles.eyebrow}>
                {t("aq.ourTake")}
              </Txt>
              {data?.verdict?.headline ? (
                <Txt style={styles.take}>{data.verdict.headline}</Txt>
              ) : null}
            </View>
          </Card>

          {/* Key numbers */}
          <View style={styles.grid}>
            <Stat
              label={t("aq.aqi")}
              value={String(Math.round(p.current_aqi))}
              sub={data?.verdict?.band_label}
            />
            <Stat
              label="PM2.5"
              value={p.pm2_5 != null ? String(p.pm2_5) : "—"}
              sub={t("aq.unit")}
            />
            <Stat
              label="PM10"
              value={p.pm10 != null ? String(p.pm10) : "—"}
              sub={t("aq.unit")}
            />
            {p.dominant_pollutant ? (
              <Stat label={t("aq.dominant")} value={p.dominant_pollutant} />
            ) : null}
          </View>

          {/* Source */}
          <Card style={styles.sourceCard}>
            <Txt weight="semibold" style={styles.sourceLabel}>
              {t("aq.source")}
            </Txt>
            <Txt weight="bold" style={styles.sourceName}>
              {data?.source_name}
            </Txt>
            <Txt style={styles.sourceSub}>
              {modelled
                ? t("aq.noStation")
                : p.station_name
                  ? p.nearest_station_km != null && p.nearest_station_km > 0
                    ? `${p.station_name} · ${p.nearest_station_km.toFixed(1)} ${t("aq.km")}`
                    : p.station_name
                  : t("aq.noStation")}
            </Txt>
            <View style={styles.confRow}>
              <ConfidenceTag confidence={data?.confidence ?? null} />
              {data?.data_vintage ? (
                <Txt style={styles.vintage}>
                  {t("detail.asOf")} {new Date(data.data_vintage).toLocaleDateString()}
                </Txt>
              ) : null}
            </View>
          </Card>
        </>
      )}
    </DetailScaffold>
  );
}

const styles = StyleSheet.create({
  takeCard: { flexDirection: "row", alignItems: "center", gap: 18, marginTop: 4 },
  eyebrow: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: theme.brand,
  },
  take: { fontSize: 14, color: theme.ink, marginTop: 6, lineHeight: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 },
  sourceCard: { marginTop: 14 },
  sourceLabel: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: theme.inkMuted,
  },
  sourceName: { fontSize: 15, color: theme.ink, marginTop: 4 },
  sourceSub: { fontSize: 12.5, color: theme.inkSecondary, marginTop: 2 },
  confRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  vintage: { fontSize: 11, color: theme.inkMuted },
});
