import { View, StyleSheet } from "react-native";

import { Txt } from "@/components/ui/Txt";
import type { Flag } from "@/src/api";
import { radius, theme } from "@/src/theme";

/**
 * A single watch-out callout from the report's flags. Serious flags read red,
 * notable ones amber — a coloured left rail and tint so the severity is legible
 * before the words are, with the headline and the honest caveat below it.
 */
export function FlagRow({ flag }: { flag: Flag }) {
  const serious = flag.severity === "serious";
  const accent = serious ? theme.bad : theme.warn;
  const tint = serious ? "#FEF2F2" : "#FFFBEB";

  return (
    <View style={[styles.row, { backgroundColor: tint, borderLeftColor: accent }]}>
      <Txt weight="bold" style={[styles.headline, { color: accent }]}>
        {flag.headline}
      </Txt>
      <Txt style={styles.detail}>{flag.detail}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderRadius: radius.md,
    borderLeftWidth: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  headline: { fontSize: 14, lineHeight: 19 },
  detail: { fontSize: 12.5, color: theme.inkSecondary, lineHeight: 18, marginTop: 4 },
});
