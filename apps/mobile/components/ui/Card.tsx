import { View, type ViewProps, StyleSheet } from "react-native";

import { radius, theme } from "@/src/theme";

/**
 * The app's surface primitive: a white rounded panel with a hairline border and
 * a soft shadow. Everything that groups content on a screen sits in one of these.
 */
export function Card({ style, ...rest }: ViewProps) {
  return <View {...rest} style={[styles.card, style]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: theme.hairline,
    padding: 16,
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
});
