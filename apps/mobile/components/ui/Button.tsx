import { Pressable, type PressableProps, StyleSheet, View } from "react-native";

import { Txt } from "@/components/ui/Txt";
import { radius, theme } from "@/src/theme";

type Variant = "primary" | "secondary";

interface Props extends Omit<PressableProps, "children"> {
  label: string;
  variant?: Variant;
  icon?: string;
}

/**
 * Primary (filled pink) and secondary (outlined) buttons. One component so the
 * two calls-to-action across the app stay visually consistent.
 */
export function Button({ label, variant = "primary", icon, style, ...rest }: Props) {
  const primary = variant === "primary";
  return (
    <Pressable
      {...rest}
      style={(state) => [
        styles.base,
        primary ? styles.primary : styles.secondary,
        state.pressed && styles.pressed,
        typeof style === "function" ? style(state) : style,
      ]}
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
    </Pressable>
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
  pressed: { opacity: 0.85 },
  inner: { flexDirection: "row", alignItems: "center", gap: 8 },
  icon: { fontSize: 16 },
  label: { fontSize: 15 },
  onPrimary: { color: "#ffffff" },
  onSecondary: { color: theme.brand },
});
