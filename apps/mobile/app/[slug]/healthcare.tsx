import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { DetailScaffold, Stat, VerdictBlock } from "@/components/DetailScaffold";
import { Icon } from "@/components/ui/Icon";
import { Txt } from "@/components/ui/Txt";
import {
  fetchConnectivity,
  NoDataError,
  type ConnectivityDetail,
} from "@/src/api";
import { useI18n } from "@/src/i18n";
import { theme } from "@/src/theme";

/**
 * Healthcare is NOT a scored category — the backend has no care-quality rating.
 * This page surfaces only the real facility counts and nearest distances mapped
 * around the locality (from the connectivity payload / OpenStreetMap), clearly
 * framed as a coverage signal, never a quality score.
 */
export default function HealthcareScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, categoryLabel } = useI18n();
  const [data, setData] = useState<ConnectivityDetail | null>(null);
  const [state, setState] = useState<"loading" | "nodata" | "error" | "ready">("loading");
  const [reason, setReason] = useState<string>();

  const load = useCallback(async () => {
    setState("loading");
    try {
      setData(await fetchConnectivity(String(slug)));
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
  const hasAny = !!p && ((p.hospitals ?? 0) > 0 || (p.clinics ?? 0) > 0);

  return (
    <DetailScaffold
      slug={String(slug)}
      title={categoryLabel("healthcare", "Healthcare")}
      state={state}
      reason={reason}
      onRetry={load}
    >
      {p && (
        <>
          <View style={styles.card}>
            <View style={styles.head}>
              <View style={[styles.badge, { backgroundColor: "#DC262618" }]}>
                <Icon name="plus" size={20} color="#DC2626" />
              </View>
              <Txt weight="semibold" style={styles.sub}>
                {t("health.sub")}
              </Txt>
            </View>
            <Txt style={styles.note}>{t("health.note")}</Txt>
          </View>

          <VerdictBlock confidence={data?.confidence} source={data?.source_name} />

          {hasAny ? (
            <View style={styles.grid}>
              <Stat label={t("conn.hospitals")} value={String(p.hospitals ?? 0)} />
              <Stat label={t("conn.clinics")} value={String(p.clinics ?? 0)} />
              {p.nearest_hospital_km != null && p.nearest_hospital_km > 0 && (
                <Stat
                  label={t("health.nearest")}
                  value={`${p.nearest_hospital_km.toFixed(1)} ${t("aq.km")}`}
                />
              )}
            </View>
          ) : (
            <Txt style={styles.empty}>{t("amenity.none")}</Txt>
          )}
        </>
      )}
    </DetailScaffold>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: theme.hairline,
    backgroundColor: theme.surface,
    borderRadius: 20,
    padding: 18,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  badge: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  sub: { flex: 1, fontSize: 15, color: theme.ink, lineHeight: 21 },
  note: { fontSize: 12.5, color: theme.inkSecondary, marginTop: 12, lineHeight: 18 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  empty: { fontSize: 13.5, color: theme.inkMuted, marginTop: 16, lineHeight: 20 },
});
