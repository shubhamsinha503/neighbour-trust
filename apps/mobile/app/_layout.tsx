import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { LanguageProvider } from "@/src/i18n";
import { SavedProvider } from "@/src/saved";
import { theme } from "@/src/theme";

// Keep the native splash up until Inter is ready, so the first frame the user
// sees is already in the app's typeface rather than the system fallback.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  // Render nothing until fonts resolve (or fail) so text never flashes in the
  // fallback face. A font error still lets the app through on system fonts.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <SavedProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.page },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="[slug]" />
          </Stack>
        </SavedProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
