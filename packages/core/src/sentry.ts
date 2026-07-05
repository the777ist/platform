// Client-side Sentry (PHILOSOPHY Observability / Cross-cutting): the SDK is
// @sentry/react-native — NOT the deprecated sentry-expo. Runtime init lives here;
// the BUILD-time half (production source maps / native symbolication) is the
// `@sentry/react-native/expo` config plugin + `getSentryExpoConfig` Metro wiring
// in each product's app (see app.config.ts / metro.config.js).
import * as Sentry from "@sentry/react-native";

import { env } from "./env";

export function initSentry(): void {
  if (!env.SENTRY_DSN) return; // no-op without a DSN (local dev, CI)
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.ENV, // development | staging | production
    tracesSampleRate: 0.1,
  });
}

/** Tag the client-side scope with the per-request id the api wrapper generated —
 * matches the API middleware's tag, so one id links client event → API event → logs. */
export function captureRequestId(requestId: string): void {
  Sentry.setTag("request_id", requestId);
}
