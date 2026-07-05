import "../global.css";
import { Slot } from "expo-router";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { AuthProvider, configureApiClient, makeQueryClient, persister } from "@platform/core";
import { ThemeProvider } from "@platform/ui/theme-provider";
import { ErrorBoundary } from "../features/_shared/error-boundary";
import { useThemeStore } from "../features/settings/use-theme";

// Point the generated hey-api client at EXPO_PUBLIC_API_URL (and attach the bearer
// token interceptor) before any query can run.
configureApiClient();
const queryClient = makeQueryClient();

export default function RootLayout() {
  const theme = useThemeStore((s) => s.theme);
  // Provider order matters: theme outermost (everything themes), then query (data
  // layer), then auth (session feeds guards + API token), then the error boundary
  // wrapping the rendered tree.
  return (
    <ThemeProvider theme={theme}>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
        <AuthProvider>
          <ErrorBoundary>
            {/* Slot renders the active group: (auth) or (tabs). useProtectedRoute,
                mounted in the (tabs) group layout, decides which one is reachable. */}
            <Slot />
          </ErrorBoundary>
        </AuthProvider>
      </PersistQueryClientProvider>
    </ThemeProvider>
  );
}
