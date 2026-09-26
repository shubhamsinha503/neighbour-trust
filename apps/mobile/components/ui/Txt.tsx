import { Text as RNText, type TextProps, StyleSheet } from "react-native";

import { font, theme } from "@/src/theme";

type Weight = "regular" | "medium" | "semibold" | "bold" | "extrabold";

interface Props extends TextProps {
  weight?: Weight;
}

/**
 * The app's one text primitive. It applies Inter (loaded in the root layout) at
 * the requested weight so screens never have to repeat `fontFamily`, and defaults
 * to the primary ink colour. Callers still pass `style` to override size/colour.
 *
 * React Native does not synthesise weights from a single font file, so each
 * weight maps to its own registered family rather than `fontWeight`.
 */
export function Txt({ weight = "regular", style, ...rest }: Props) {
  return (
    <RNText
      {...rest}
      style={[styles.base, { fontFamily: font[weight] }, style]}
    />
  );
}

const styles = StyleSheet.create({
  base: { color: theme.ink },
});
