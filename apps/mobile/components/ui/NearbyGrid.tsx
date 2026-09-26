import { View, StyleSheet } from "react-native";

import { Txt } from "@/components/ui/Txt";
import type { ConnectivityDetail } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { radius, theme } from "@/src/theme";

/**
 * "What's nearby" — the built-up amenities counted around the locality centroid,
 * from the connectivity payload. Only the kinds we actually have a count for are
 * shown, each with its nearest distance where known, so an empty category never
 * renders a hollow "0" tile.
 */
export function NearbyGrid({ payload }: { payload: ConnectivityDetail["payload"] }) {
  const { t } = useI18n();

  const tiles: Array<{ label: string; count?: number; sub?: string }> = [
    {
      label: t("conn.metro"),
      count: payload.metro_rail_stations,
      sub: km(payload.nearest_station_km),
    },
    {
      label: t("conn.hospitals"),
      count: payload.hospitals,
      sub: km(payload.nearest_hospital_km),
    },
    { label: t("conn.clinics"), count: payload.clinics },
    {
      label: t("conn.parks"),
      count: payload.parks,
      sub: km(payload.nearest_park_km),
    },
    { label: t("conn.markets"), count: payload.markets },
  ].filter((x) => x.count != null);

  if (tiles.length === 0) return null;

  return (
    <View style={styles.grid}>
      {tiles.map((x) => (
        <View key={x.label} style={styles.tile}>
          <Txt weight="extrabold" style={styles.count}>
            {x.count}
          </Txt>
          <Txt weight="medium" style={styles.label}>
            {x.label}
          </Txt>
          {x.sub ? <Txt style={styles.sub}>{x.sub}</Txt> : null}
        </View>
      ))}
    </View>
  );
}

function km(v?: number | null): string | undefined {
  return v != null ? `~${v.toFixed(1)} km` : undefined;
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: theme.plane,
    borderRadius: radius.md,
    padding: 14,
  },
  count: { fontSize: 22, color: theme.ink },
  label: { fontSize: 12, color: theme.inkSecondary, marginTop: 2 },
  sub: { fontSize: 11, color: theme.inkMuted, marginTop: 2 },
});
