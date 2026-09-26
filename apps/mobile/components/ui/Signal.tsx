import { View, StyleSheet } from "react-native";

import { Icon } from "@/components/ui/Icon";
import { Txt } from "@/components/ui/Txt";
import { radius, theme } from "@/src/theme";

type Tone = "positive" | "caution";

/**
 * An "at a glance" row from the web prototype: a tinted panel with an icon, a
 * bold lead and a supporting line. Positive reads green, caution reads amber —
 * used to surface a locality's strongest and weakest measured areas.
 */
export function Signal({
  tone,
  title,
  detail,
}: {
  tone: Tone;
  title: string;
  detail: string;
}) {
  const positive = tone === "positive";
  const accent = positive ? theme.good : theme.warn;
  const bg = positive ? theme.goodSoft : theme.warnSoft;

  return (
    <View style={[styles.row, { backgroundColor: bg }]}>
      <Icon name={positive ? "check" : "info"} size={18} color={accent} />
      <View style={{ flex: 1 }}>
        <Txt weight="bold" style={[styles.title, { color: accent }]}>
          {title}
        </Txt>
        <Txt style={styles.detail}>{detail}</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
  },
  title: { fontSize: 13.5, lineHeight: 18 },
  detail: { fontSize: 12.5, color: theme.inkSecondary, lineHeight: 18, marginTop: 3 },
});
