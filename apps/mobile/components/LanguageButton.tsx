import { useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { LOCALES, LOCALE_NAMES, useI18n } from "@/src/i18n";
import { theme } from "@/src/theme";

/**
 * Compact language control for every screen's top-right: a globe + the current
 * language name that opens a modal of the five options. One component, shared, so
 * the control is identical everywhere and the chosen language (persisted in
 * AsyncStorage via the provider) is always reachable.
 */
export function LanguageButton() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={styles.trigger}
        accessibilityLabel={t("lang.label")}
      >
        <Text style={styles.globe}>🌐</Text>
        <Text style={styles.triggerText}>{LOCALE_NAMES[locale]}</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t("lang.label")}</Text>
            {LOCALES.map((l) => {
              const active = l === locale;
              return (
                <Pressable
                  key={l}
                  onPress={() => {
                    setLocale(l);
                    setOpen(false);
                  }}
                  style={[styles.option, active && styles.optionActive]}
                >
                  <Text
                    style={[styles.optionText, active && styles.optionTextActive]}
                  >
                    {LOCALE_NAMES[l]}
                  </Text>
                  {active ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: theme.hairline,
    backgroundColor: theme.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  globe: { fontSize: 13 },
  triggerText: { fontSize: 12, fontWeight: "600", color: theme.inkSecondary },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 16,
    paddingBottom: 32,
  },
  sheetTitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: theme.inkMuted,
    marginBottom: 8,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  optionActive: { backgroundColor: theme.brandSoft },
  optionText: { fontSize: 16, color: theme.ink },
  optionTextActive: { color: theme.brandDeep, fontWeight: "700" },
  check: { fontSize: 16, color: theme.brandDeep, fontWeight: "700" },
});
