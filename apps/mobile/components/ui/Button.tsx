import * as Haptics from "expo-haptics";
import type { GestureResponderEvent, PressableProps } from "react-native";
import { StyleSheet, View } from "react-native";

import { PressableScale } from "@/components/ui/PressableScale";
import { Txt } from "@/components/ui/Txt";
import { radius, theme } from "@/src/theme";

type Variant = "primary" | "secondary";

interface Props extends Omit<PressableProps, "children" | "style"> {
  label: string;
  variant?: Variant;
  icon?: string;
}

/**
 * Primary (filled pink) and secondary (outlined) buttons. Press-scales for
 * physical feedback and fires a light haptic on the commit — one per tap.
 */
export function Button({ label, variant = "primary", icon, onPress, ...rest }: Props) {
  const primary = variant === "primary";
  return (
    <PressableScale
      {...rest}
      onPress={(e: GestureResponderEvent) => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(e);
      }}
      style={[styles.base, primary ? styles.primary : styles.secondary]}
    >
      <View style={styles.inner}>
        {icon ? (
          <Txt style={[styles.icon, primary ? styles.onPrimary : styles.onSecondary]}>
            {icon}
          </Txt>
        ) : null}
        <Txt weight="bold" style={[styles.label, primary ? styles.onPrimary : styles.onSecondary]}>
          {label}
        </Txt>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: theme.brand },
  secondary: {
    backgroundColor: theme.surface,
    borderWidth: 1.5,
    borderColor: theme.brand,
  },
  inner: { flexDirection: "row", alignItems: "center", gap: 8 },
  icon: { fontSize: 16 },
  label: { fontSize: 15 },
  onPrimary: { color: "#ffffff" },
  onSecondary: { color: theme.brand },
});
