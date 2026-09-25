import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { LanguageProvider } from "@/src/i18n";
import { theme } from "@/src/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.page },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="[slug]" />
        </Stack>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
