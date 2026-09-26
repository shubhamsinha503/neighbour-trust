import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { DetailScaffold, Stat, VerdictBlock } from "@/components/DetailScaffold";
import { Txt } from "@/components/ui/Txt";
import { fetchSchools, NoDataError, type SchoolsDetail } from "@/src/api";
import { useI18n } from "@/src/i18n";
import { theme } from "@/src/theme";

export default function SchoolsScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, categoryLabel } = useI18n();
  const [data, setData] = useState<SchoolsDetail | null>(null);
  const [state, setState] = useState<"loading" | "nodata" | "error" | "ready">(
    "loading",
  );
  const [reason, setReason] = useState<string>();

  const load = useCallback(async () => {
    setState("loading");
    try {
      setData(await fetchSchools(String(slug)));
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
      title={categoryLabel("schools", "Schools")}
      state={state}
      reason={reason}
      onRetry={load}
    >
      {p && (
        <>
          <VerdictBlock
            headline={data?.verdict?.headline}
            confidence={data?.confidence}
            source={data?.source_name}
            vintage={data?.data_vintage}
          />
          <View style={styles.grid}>
            <Stat label={t("schools.within2")} value={String(p.schools_within_2km)} />
            <Stat label={t("schools.within5")} value={String(p.schools_within_5km)} />
            <Stat
              label={t("schools.staffingKnown")}
              value={String(p.schools_with_staffing_data)}
            />
            {p.median_pupil_teacher_ratio != null && (
              <Stat
                label={t("schools.ptr")}
                value={String(p.median_pupil_teacher_ratio)}
              />
            )}
          </View>

          {p.nearest_schools && p.nearest_schools.length > 0 && (
            <View style={{ marginTop: 16 }}>
              <Txt weight="bold" style={styles.sectionLabel}>
                {t("schools.nearest")}
              </Txt>
              {p.nearest_schools.slice(0, 8).map((s, i) => (
                <View key={`${s.name}-${i}`} style={styles.schoolRow}>
                  <Txt weight="medium" style={styles.schoolName}>
                    {s.name}
                  </Txt>
                  {s.distance_km != null && (
                    <Txt weight="semibold" style={styles.schoolDist}>
                      {s.distance_km.toFixed(1)} {t("aq.km")}
                    </Txt>
                  )}
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </DetailScaffold>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    color: theme.inkSecondary,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  schoolRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.hairline,
  },
  schoolName: { fontSize: 13, color: theme.ink, flex: 1 },
  schoolDist: { fontSize: 12, color: theme.brand, fontWeight: "600" },
});
