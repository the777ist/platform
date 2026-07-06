import "../global.css";
import { Slot } from "expo-router";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import {
  AuthProvider,
  configureApiClient,
  initSentry,
  makeQueryClient,
  persister,
} from "@platform/core";
import { client } from "@platform/demo-api-client";
import { ThemeProvider } from "@platform/ui/theme-provider";
import { ErrorBoundary } from "../features/_shared/error-boundary";
import { useThemeStore } from "../features/settings/use-theme";

// Sentry first (no-op without EXPO_PUBLIC_SENTRY_DSN), then point THIS product's
// generated hey-api client at EXPO_PUBLIC_API_URL (attaching the bearer-token +
// X-Request-Id interceptor) before any query can run. Core is product-agnostic —
// the product passes its own client instance in.
initSentry();
configureApiClient(client);
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
