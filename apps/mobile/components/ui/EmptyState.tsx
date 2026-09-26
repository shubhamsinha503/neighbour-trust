import { View, StyleSheet } from "react-native";

import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Txt } from "@/components/ui/Txt";
import { theme } from "@/src/theme";

/**
 * The shared empty / error state: a tinted icon medallion, a bold line, a calm
 * explanation and an optional action. One component so "nothing here yet" and
 * "couldn't load" read the same across the app.
 */
export function EmptyState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Icon name={icon} size={30} color={theme.brand} />
      </View>
      <Txt weight="bold" style={styles.title}>
        {title}
      </Txt>
      <Txt style={styles.message}>{message}</Txt>
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button label={actionLabel} variant="secondary" onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", paddingHorizontal: 28, paddingVertical: 56 },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: theme.brandSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: { fontSize: 17, color: theme.ink, marginBottom: 8, textAlign: "center" },
  message: { fontSize: 14, color: theme.inkMuted, textAlign: "center", lineHeight: 20 },
  action: { marginTop: 18 },
});
