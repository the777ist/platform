import "../global.css";
import { Stack } from "expo-router";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { configureApiClient, makeQueryClient, persister } from "@platform/core";
import { ThemeProvider } from "@platform/ui/theme-provider";
import { useThemeStore } from "../features/settings/use-theme";

// Point the generated hey-api client at EXPO_PUBLIC_API_URL before any query can run.
configureApiClient();
const queryClient = makeQueryClient();

export default function RootLayout() {
  const theme = useThemeStore((s) => s.theme);
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
      <ThemeProvider theme={theme}>
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}
