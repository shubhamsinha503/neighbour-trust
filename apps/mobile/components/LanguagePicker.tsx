import { Pressable, ScrollView, StyleSheet, Text } from "react-native";

import { LOCALES, LOCALE_NAMES, useI18n } from "@/src/i18n";
import { theme } from "@/src/theme";

/** A horizontal row of language chips. Tapping one re-renders the whole tree in
 *  that language, since every screen reads from the same context. */
export function LanguagePicker() {
  const { locale, setLocale } = useI18n();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {LOCALES.map((l) => {
        const active = l === locale;
        return (
          <Pressable
            key={l}
            onPress={() => setLocale(l)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.text, active && styles.textActive]}>
              {LOCALE_NAMES[l]}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 4 },
  chip: {
    borderWidth: 1,
    borderColor: theme.hairline,
    backgroundColor: theme.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipActive: { backgroundColor: theme.brand, borderColor: theme.brand },
  text: { fontSize: 13, color: theme.inkSecondary, fontWeight: "600" },
  textActive: { color: "#fff" },
});
