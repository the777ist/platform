import "../global.css";
import { Stack } from "expo-router";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { makeQueryClient, persister } from "@platform/core";
import { ThemeProvider } from "@platform/ui/theme-provider";
import { useThemeStore } from "../features/settings/use-theme";

const queryClient = makeQueryClient();

export default function RootLayout() {
  const theme = useThemeStore((s) => s.theme);
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
    >
      <ThemeProvider theme={theme}>
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}
