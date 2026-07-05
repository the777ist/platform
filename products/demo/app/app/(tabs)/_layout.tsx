import { Tabs } from "expo-router";
import { useProtectedRoute } from "@platform/core";
import { Text } from "@platform/ui";

export default function TabsLayout() {
  const { loading } = useProtectedRoute(); // redirects to (auth)/login when signed out
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
