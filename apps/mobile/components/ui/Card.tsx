import { View, type ViewProps, StyleSheet } from "react-native";

import { radius, shadow, theme } from "@/src/theme";

/**
 * The app's surface primitive: a white rounded panel with a hairline border and
 * the prototype's soft, deep shadow. Everything that groups content sits in one.
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
    ...shadow.card,
  },
});
