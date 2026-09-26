import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";

import { Icon, type IconName } from "@/components/ui/Icon";
import { font, theme } from "@/src/theme";
import { useI18n } from "@/src/i18n";

/**
 * The five-tab bottom navigation from the product mockup. The Map tab is present
 * but its screen is a deliberate "coming soon" placeholder — the interactive
 * sun-and-shadow map needs a dev build, so it ships after Expo Go foundation work.
 */
export default function TabsLayout() {
  const { t } = useI18n();

  const tab = (name: IconName, filledWhenActive = false) =>
    ({ color, focused }: { color: ColorValue; focused: boolean }) => (
      <Icon
        name={name}
        color={color as string}
        size={24}
        filled={filledWhenActive && focused}
      />
    );

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.brand,
        tabBarInactiveTintColor: theme.inkMuted,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.hairline,
          height: 62,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t("nav.home"), tabBarIcon: tab("home") }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: t("nav.search"), tabBarIcon: tab("search") }}
      />
      <Tabs.Screen
        name="map"
        options={{ title: t("nav.map"), tabBarIcon: tab("map") }}
      />
      <Tabs.Screen
        name="saved"
        options={{ title: t("nav.saved"), tabBarIcon: tab("bookmark", true) }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: t("nav.more"), tabBarIcon: tab("menu") }}
      />
    </Tabs>
  );
}
