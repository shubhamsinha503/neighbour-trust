import { View, StyleSheet } from "react-native";

import { Txt } from "@/components/ui/Txt";
import { useI18n } from "@/src/i18n";
import { CONFIDENCE_COLOR, theme } from "@/src/theme";

interface Props {
  /** The API's confidence string: high | medium | low | community_estimated. */
  confidence: string | null;
}

/**
 * The credibility marker shown under every data point: a coloured dot (green =
 * high, amber = medium, orange = low, violet = community-estimated) plus a
 * translated label. Null confidence falls back to the "no data yet" phrasing.
 */
export function ConfidenceTag({ confidence }: Props) {
  const { t } = useI18n();

  if (!confidence) {
    return <Txt style={styles.none}>{t("common.noDataYet")}</Txt>;
  }

  const color = CONFIDENCE_COLOR[confidence] ?? theme.inkMuted;
  const key = `conf.${confidence}`;
  const label = t(key) === key ? confidence : t(key);

  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Txt weight="semibold" style={styles.label}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 999 },
  label: { fontSize: 11, color: theme.inkSecondary },
  none: { fontSize: 11, color: theme.inkMuted },
});
