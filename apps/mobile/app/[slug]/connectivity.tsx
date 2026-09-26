import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { DetailScaffold, Stat, VerdictBlock } from "@/components/DetailScaffold";
import { Txt } from "@/components/ui/Txt";
import {
  fetchConnectivity,
  NoDataError,
  type ConnectivityDetail,
} from "@/src/api";
import { useI18n } from "@/src/i18n";
import { theme } from "@/src/theme";

export default function ConnectivityScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, categoryLabel } = useI18n();
  const [data, setData] = useState<ConnectivityDetail | null>(null);
  const [state, setState] = useState<"loading" | "nodata" | "error" | "ready">(
    "loading",
  );
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

  return (
    <DetailScaffold
      slug={String(slug)}
      title={categoryLabel("infrastructure", "Connectivity")}
      state={state}
      reason={reason}
      onRetry={load}
    >
      {p && (
        <>
          {p.summary ? (
            <View style={styles.card}>
              <Txt weight="semibold" style={styles.summary}>
                {p.summary}
              </Txt>
            </View>
          ) : null}
          <VerdictBlock confidence={data?.confidence} source={data?.source_name} />
          <View style={styles.grid}>
            <Stat label={t("conn.metro")} value={String(p.metro_rail_stations ?? 0)} />
            <Stat label={t("conn.hospitals")} value={String(p.hospitals ?? 0)} />
            <Stat label={t("conn.clinics")} value={String(p.clinics ?? 0)} />
            <Stat label={t("conn.parks")} value={String(p.parks ?? 0)} />
            <Stat label={t("conn.markets")} value={String(p.markets ?? 0)} />
          </View>
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
  summary: { fontSize: 15, fontWeight: "600", color: theme.ink, lineHeight: 21 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
});
