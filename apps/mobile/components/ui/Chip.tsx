import * as Haptics from "expo-haptics";
import { StyleSheet } from "react-native";

import { PressableScale } from "@/components/ui/PressableScale";
import { Txt } from "@/components/ui/Txt";
import { radius, theme } from "@/src/theme";

interface Props {
  label: string;
  active?: boolean;
  onPress?: () => void;
}

/**
 * A pill used for example searches and city filters. Active chips fill with the
 * soft brand tint and a brand border; inactive ones are quiet outlines. A
 * selection haptic marks the choice.
 */
export function Chip({ label, active = false, onPress }: Props) {
  return (
    <PressableScale
      onPress={() => {
        void Haptics.selectionAsync();
        onPress?.();
      }}
      style={[styles.chip, active ? styles.active : styles.inactive]}
    >
      <Txt
        weight={active ? "semibold" : "medium"}
        style={[styles.label, { color: active ? theme.brandDeep : theme.inkSecondary }]}
      >
        {label}
      </Txt>
    </PressableScale>
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
