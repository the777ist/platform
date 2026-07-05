// PHILOSOPHY.md (Config essentials → Typegen): "App sets client baseUrl from EXPO_PUBLIC_API_URL
// at startup." packages/core (api.ts) is the client wrapper: baseUrl, auth header,
// X-Request-Id injection. This phase wires baseUrl only (auth header lands in Phase 6,
// X-Request-Id in Phase 8).
import { client } from "@platform/template-api-client";

import { env } from "./env";

let configured = false;

/**
 * Configure the generated hey-api client once, at app startup, before any query runs.
 * Call from app/_layout.tsx (alongside the query + persist provider from Phase 2).
 */
export function configureApiClient(): void {
  if (configured) return;
  client.setConfig({
    baseUrl: env.apiUrl,
  });
  configured = true;
}
