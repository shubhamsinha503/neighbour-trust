import { View, StyleSheet } from "react-native";

import { Icon, type IconName } from "@/components/ui/Icon";
import { Txt } from "@/components/ui/Txt";
import type { ConnectivityDetail } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { theme } from "@/src/theme";

/**
 * "What's nearby" — the built-up amenities counted around the locality centroid,
 * from the connectivity payload, as a list with each kind's icon, how many are
 * nearby, and (where the payload gives a nearest distance) that distance and a
 * rough walking time. Only kinds we actually have a count for are shown, so an
 * empty category never renders a hollow row.
 */
export function NearbyList({ payload }: { payload: ConnectivityDetail["payload"] }) {
  const { t } = useI18n();

  const all: Array<{
    icon: IconName;
    label: string;
    count?: number;
    km?: number | null;
  }> = [
    { icon: "hospital", label: t("conn.hospitals"), count: payload.hospitals, km: payload.nearest_hospital_km },
    { icon: "tree", label: t("conn.parks"), count: payload.parks, km: payload.nearest_park_km },
    { icon: "cart", label: t("conn.markets"), count: payload.markets },
    { icon: "drop", label: t("conn.clinics"), count: payload.clinics },
    { icon: "train", label: t("conn.metro"), count: payload.metro_rail_stations, km: payload.nearest_station_km },
  ];
  const rows = all.filter((r) => r.count != null);

  if (rows.length === 0) return null;

  return (
    <View style={styles.list}>
      {rows.map((r, i) => (
        <View key={r.label} style={[styles.row, i === rows.length - 1 && styles.lastRow]}>
          <View style={styles.iconWrap}>
            <Icon name={r.icon} size={18} color={theme.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt weight="bold" style={styles.label}>
              {r.label}
            </Txt>
            <Txt style={styles.count}>
              {r.count} {t("nearby.count")}
            </Txt>
          </View>
          {r.km != null && r.km > 0 ? (
            <View style={styles.right}>
              <Txt weight="bold" style={styles.dist}>
                {fmtDist(r.km)}
              </Txt>
              <Txt style={styles.walk}>{t("nearby.walk").replace("{m}", String(walkMins(r.km)))}</Txt>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** Metres under 1 km, else one decimal of km. */
function fmtDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/** Rough walking time at ~5 km/h. */
function walkMins(km: number): number {
  return Math.max(1, Math.round(km * 12));
}

const styles = StyleSheet.create({
  list: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.hairline,
    borderRadius: 18,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.hairline,
  },
  lastRow: { borderBottomWidth: 0 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: theme.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: 14, color: theme.ink },
  count: { fontSize: 12, color: theme.inkMuted, marginTop: 1 },
  right: { alignItems: "flex-end" },
  dist: { fontSize: 13, color: theme.ink },
  walk: { fontSize: 11, color: theme.inkMuted, marginTop: 1 },
});
