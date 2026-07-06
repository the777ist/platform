// PHILOSOPHY.md (Config essentials → Typegen): "App sets client baseUrl from EXPO_PUBLIC_API_URL
// at startup." packages/core (api.ts) is the client wrapper: baseUrl, auth header,
// X-Request-Id injection (PHILOSOPHY Observability: a generated id per request, tagged
// into Sentry on both sides → client→API→logs traceability).
//
// The PRODUCT's generated client is passed IN (core is shared and product-agnostic —
// it cannot import @platform/<product>-api-client itself; each product's _layout.tsx
// passes its own instance). Structural type below matches the hey-api client surface.
import { getAccessToken } from "./auth";
import { env } from "./env";
import { captureRequestId } from "./sentry";

/** The slice of the generated hey-api client this wrapper needs (structural —
 * every product's generated client satisfies it without a workspace dependency). */
export interface GeneratedApiClient {
  setConfig(config: { baseUrl?: string }): unknown;
  interceptors: {
    request: { use(interceptor: (request: Request) => Request): unknown };
  };
}

// crypto.randomUUID exists on web + Hermes (RN 0.85). Fallback kept for safety.
function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const configured = new WeakSet<GeneratedApiClient>();

/**
 * Configure a product's generated hey-api client once, at app startup, before any
 * query runs. Call from app/_layout.tsx with the client exported by the product's
 * api-client package: `configureApiClient(client)`.
 */
export function configureApiClient(client: GeneratedApiClient): void {
  if (configured.has(client)) return;
  client.setConfig({
    baseUrl: env.API_URL,
  });
  client.interceptors.request.use((request) => {
    // One generated id per request; the API middleware echoes it back and logs it,
    // and both Sentry scopes are tagged with it.
    const requestId = newRequestId();
    request.headers.set("X-Request-Id", requestId);
    captureRequestId(requestId);
    // Core domain data goes through FastAPI, which VERIFIES the Supabase JWT — so every
    // API request forwards the access token. getAccessToken() reads the zustand store
    // outside React, keeping the interceptor synchronous.
    const token = getAccessToken();
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  });
  configured.add(client);
}
