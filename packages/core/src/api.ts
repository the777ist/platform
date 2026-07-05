// PHILOSOPHY.md (Config essentials → Typegen): "App sets client baseUrl from EXPO_PUBLIC_API_URL
// at startup." packages/core (api.ts) is the client wrapper: baseUrl, auth header,
// X-Request-Id injection. baseUrl (Phase 4) + bearer token (Phase 6); X-Request-Id lands
// in Phase 8.
import { client } from "@platform/template-api-client";

import { getAccessToken } from "./auth";
import { env } from "./env";

let configured = false;

/**
 * Configure the generated hey-api client once, at app startup, before any query runs.
 * Call from app/_layout.tsx (alongside the query + persist provider from Phase 2).
 */
export function configureApiClient(): void {
  if (configured) return;
  client.setConfig({
    baseUrl: env.API_URL,
  });
  // Core domain data goes through FastAPI, which VERIFIES the Supabase JWT — so every
  // API request forwards the access token. getAccessToken() reads the zustand store
  // outside React, keeping the interceptor synchronous.
  client.interceptors.request.use((request) => {
    const token = getAccessToken();
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  });
  configured = true;
}
