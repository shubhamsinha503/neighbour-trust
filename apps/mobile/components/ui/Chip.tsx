import { Pressable, StyleSheet } from "react-native";

import { Txt } from "@/components/ui/Txt";
import { radius, theme } from "@/src/theme";

interface Props {
  label: string;
  active?: boolean;
  onPress?: () => void;
}

/**
 * A pill used for example searches and city filters. Active chips fill with the
 * soft brand tint and a brand border; inactive ones are quiet outlines.
 */
export function Chip({ label, active = false, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active ? styles.active : styles.inactive,
        pressed && { opacity: 0.75 },
      ]}
    >
      <Txt
        weight={active ? "semibold" : "medium"}
        style={[styles.label, { color: active ? theme.brandDeep : theme.inkSecondary }]}
      >
        {label}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  active: { backgroundColor: theme.brandSoft, borderColor: theme.brandLight },
  inactive: { backgroundColor: theme.surface, borderColor: theme.hairline },
  label: { fontSize: 13 },
});
