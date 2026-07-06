import { useEffect } from "react";
import { Tabs } from "expo-router";
import { registerForPushNotifications, useProtectedRoute, useSession } from "@platform/core";
import { registerToken } from "@platform/demo-api-client";
import { Text } from "@platform/ui";

export default function TabsLayout() {
  const { loading } = useProtectedRoute(); // redirects to (auth)/login when signed out
  const session = useSession();

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
    return <Text className="text-muted-foreground m-auto">Loading…</Text>;
  }
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
