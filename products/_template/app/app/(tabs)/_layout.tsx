import { useEffect } from "react";
import { Tabs } from "expo-router";
import { registerForPushNotifications, useProtectedRoute, useSession } from "@platform/core";
import { registerToken } from "@platform/template-api-client";
import { Text, themeColors } from "@platform/ui";

import { useThemeStore } from "../../features/settings/use-theme";

export default function TabsLayout() {
  const { loading } = useProtectedRoute(); // redirects to (auth)/login when signed out
  const session = useSession();
  const theme = useThemeStore((s) => s.theme);

  // Push loop (PHILOSOPHY): register this device's Expo push token once a session
  // exists. No-op on web/simulators/Expo Go (needs a dev build on a real device);
  // failures are non-fatal — push is best-effort, never blocks the app.
  useEffect(() => {
    if (!session) return;
    registerForPushNotifications((body) => registerToken({ body, throwOnError: true })).catch(
      () => undefined,
    );
  }, [session]);

  if (loading) {
    // hold the splash/loader while the persisted session hydrates — no flicker
    return <Text className="m-auto text-muted-foreground">Loading…</Text>;
  }
  // The tab bar is React Navigation CHROME: `className`/NativeWind never reach it, so without
  // explicit colours it renders React Navigation's own light palette — a white bar glued under
  // a dark app. Feed it the SAME semantic tokens everything else uses so the chrome tracks the
  // theme store. `themes` holds NativeWind `vars()` objects, hence the CSS-var lookup and the
  // hsl() wrapper; a hardcoded hex here would violate the tokens-only rule outright.
  const token = (name: keyof (typeof themeColors)["light"]) => themeColors[theme][name];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: token("--background"),
          borderTopColor: token("--border"),
        },
        tabBarActiveTintColor: token("--foreground"),
        tabBarInactiveTintColor: token("--muted-foreground"),
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
