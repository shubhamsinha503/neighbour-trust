import { useState } from "react";
import { Pressable, View, StyleSheet } from "react-native";

import { Icon } from "@/components/ui/Icon";
import { Txt } from "@/components/ui/Txt";
import type { Flag } from "@/src/api";
import { radius, theme } from "@/src/theme";

/**
 * A watch-out callout, compact by default: a warning glyph (red for serious,
 * amber for notable), the one-line headline, and a chevron. Tapping expands the
 * honest caveat detail, so the list stays scannable but the nuance is one tap
 * away — the app's "we tell you what this does and doesn't mean" stance.
 */
export function FlagRow({ flag }: { flag: Flag }) {
  const [open, setOpen] = useState(false);
  const serious = flag.severity === "serious";
  const accent = serious ? theme.bad : theme.warn;

  return (
    <Pressable
      onPress={() => setOpen((v) => !v)}
      style={[styles.row, { borderColor: theme.hairline }]}
    >
      <View style={styles.head}>
        <Icon name="warning" size={18} color={accent} />
        <Txt weight="semibold" style={styles.headline} numberOfLines={open ? undefined : 2}>
          {flag.headline}
        </Txt>
        <View style={open ? styles.chevronOpen : undefined}>
          <Icon name="chevron" size={16} color={theme.inkMuted} />
        </View>
      </View>
      {open ? <Txt style={styles.detail}>{flag.detail}</Txt> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: theme.surface,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginBottom: 10,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  headline: { flex: 1, fontSize: 13.5, color: theme.ink, lineHeight: 18 },
  chevronOpen: { transform: [{ rotate: "90deg" }] },
  detail: {
    fontSize: 12.5,
    color: theme.inkSecondary,
    lineHeight: 18,
    marginTop: 8,
    marginLeft: 28,
  },
});
