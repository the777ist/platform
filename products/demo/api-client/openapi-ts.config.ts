import { defineConfig } from "@hey-api/openapi-ts";

// PHILOSOPHY.md (api-client/ tree): input ../api/openapi.json; output committed under src/.
// Plugins: the bundled @hey-api/client-fetch client (referenced by PLUGIN string only —
// it ships inside @hey-api/openapi-ts since 0.73, NOT a separate install) + the TanStack
// Query plugin (generates queryOptions / infiniteQueryOptions + a typed SDK), which
// PHILOSOPHY.md picks over openapi-typescript + openapi-fetch precisely because it needs no
// hand-written glue.
export default defineConfig({
  input: "../api/openapi.json",
  output: {
    path: "src",
    // keep generated output consistent with repo Prettier config
    // (openapi-ts 0.99: `format: "prettier"` is deprecated in favor of postProcess)
    postProcess: ["prettier"],
  },
  plugins: [
    {
      name: "@hey-api/client-fetch",
      // Barrel-export the shared `client` so core/api.ts can `setConfig({ baseUrl })`
      // via the package root (0.99 keeps it out of index.ts by default).
      exportFromIndex: true,
    },
    "@hey-api/schemas",
    {
      name: "@hey-api/typescript",
      // RFC 9457 problem+json error shapes flow through as typed errors.
    },
    {
      name: "@hey-api/sdk",
    },
    {
      name: "@tanstack/react-query",
      // Emits queryOptions + infiniteQueryOptions wrappers for cursor-paginated routes,
      // which features/home consumes via useInfiniteQuery. Barrel-exported for the app.
      exportFromIndex: true,
    },
  ],
});
