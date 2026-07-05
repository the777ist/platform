# Data/state/typegen — accuracy review (June 2026)

## Summary

**18 claims checked** across PHILOSOPHY.md (Decision Sheet "Contracts", "Typegen" config block,
`packages/core` tree, Phase 4 row) and the three guides (phase-4-typegen, phase-2-design-system,
phase-6-auth).

- ✅ Correct: **12**
- ⚠️ Imprecise / needs adjustment: **4**
- ❌ Wrong: **1**
- ❓ Open / unverifiable in-domain (cursor DTO field names): **1**

**Headline:** The data/state/typegen architecture is sound and the package/plugin names are
overwhelmingly current — **with one real, repeated error**: `@hey-api/client-fetch` is **no
longer a package you install**. It was **deprecated on npm and bundled directly into
`@hey-api/openapi-ts` as of v0.73.0** (current openapi-ts is **0.98.2**, still pre-1.0). The
string `@hey-api/client-fetch` survives **only as a plugin identifier** inside the `plugins`
array — which the guides actually use correctly — but PHILOSOPHY.md and Phase 4 also tell you to add
`@hey-api/client-fetch` to `dependencies` and pin it exact, which installs a deprecated,
redundant package. TanStack Query is still **v5** (no React v6), Zustand is still **v5**, and the
persistence packages all exist and are current. The Phase 4 guess of the generated hook name
(`listItemsInfiniteOptions`) is **verified correct** against the plugin's default naming.

**Verdict: APPROVE WITH CHANGES.** Fix the `@hey-api/client-fetch`-as-dependency error
(one-line change in two places); everything else is either correct or a stale-but-valid version
pin to refresh at install time.

---

## Findings

### 1. `@hey-api/client-fetch` listed as an installable dependency

- **Location:** PHILOSOPHY.md line 286–287 ("Typegen" block: "`@hey-api/openapi-ts` pinned exact +
  `@hey-api/client-fetch` + TanStack Query plugin"); line 36 Decision Sheet; phase-4-typegen.md
  Step 3 `package.json` (`"@hey-api/client-fetch": "0.x.y"` in `dependencies`), DoD line 64–65,
  Open-questions line 777–778, Gotchas line 668.
- **Claim:** `@hey-api/client-fetch` is a separate npm dependency that must be installed and
  pinned exact alongside `@hey-api/openapi-ts`.
- **Status:** ❌
- **Finding:** The npm package `@hey-api/client-fetch` is **deprecated**. Its current latest
  (0.13.1, published 2025-06-12) carries the deprecation message verbatim: _"Starting with
  v0.73.0, this package is bundled directly inside @hey-api/openapi-ts."_ Current
  `@hey-api/openapi-ts` is **0.98.2** (pre-1.0), well past 0.73.0, so the fetch client ships
  **inside** openapi-ts and needs **no separate install**. Installing `@hey-api/client-fetch`
  today pulls a deprecated, redundant package. Crucially, the **plugin name string**
  `@hey-api/client-fetch` is still valid and correct — it's the `name` field of the bundled
  client plugin (confirmed in the plugin's `config.ts`: `name: '@hey-api/client-fetch'`). So the
  `openapi-ts.config.ts` `plugins: ["@hey-api/client-fetch", ...]` usage (phase-4 Step 4) is
  **fine**; only the `package.json` dependency and the "pin it exact" instructions are wrong.
- **Recommended change:** Remove `"@hey-api/client-fetch"` from the api-client `package.json`
  `dependencies`. Keep `@hey-api/openapi-ts` as the only hey-api dependency (devDep, pinned
  exact). Reword PHILOSOPHY.md's Typegen block and the Phase 4 DoD/Gotchas/Open-questions to: "the
  Fetch client is bundled in `@hey-api/openapi-ts` (≥0.73.0); reference it via the
  `@hey-api/client-fetch` **plugin** in `openapi-ts.config.ts` — do not install a separate
  client package." Pin only `@hey-api/openapi-ts` exact.
- **Source(s):** npm registry deprecation field for `@hey-api/client-fetch@0.13.1`;
  `@hey-api/openapi-ts` dist-tags (`latest: 0.98.2`); GitHub
  `packages/openapi-ts/src/plugins/@hey-api/client-fetch/config.ts`.

### 2. `@hey-api/openapi-ts` is pre-1.0 and must be pinned exact

- **Location:** PHILOSOPHY.md line 36, 286; phase-4-typegen.md DoD line 64, Gotchas line 668.
- **Claim:** `@hey-api/openapi-ts` is still pre-1.0; pin exact (no `^`/`~`).
- **Status:** ✅
- **Finding:** Correct. Current latest is **0.98.2** (2026-era; a `next` channel exists at
  `0.0.0-next-*`). The README/docs explicitly state the package is "in initial development.
  Please pin an exact version so you can safely upgrade." The pin-exact discipline is exactly
  right.
- **Recommended change:** None (resolve the OPEN version flag to `0.98.2` or the resolved latest
  at install time).
- **Source(s):** npm registry `@hey-api/openapi-ts` dist-tags; GitHub
  `packages/openapi-ts/README.md`.

### 3. TanStack Query plugin name + that it generates `queryOptions`/`infiniteQueryOptions`

- **Location:** PHILOSOPHY.md line 36, 288–289; phase-4-typegen.md Step 4 (`{ name: "@tanstack/react-query" }`),
  DoD line 65 ("`queryOptions`, `infiniteQueryOptions`").
- **Claim:** The TanStack Query plugin (`@tanstack/react-query`) generates `queryOptions` and
  `infiniteQueryOptions` wrappers.
- **Status:** ✅
- **Finding:** Confirmed against source. The plugin's `UserConfig`/`Config` is
  `Plugin.Name<'@tanstack/react-query'>` and its `defaultConfig` enables `queryOptions`
  (`enabled: true`, name `{{name}}Options`) and `infiniteQueryOptions` (`enabled: true`, name
  `{{name}}InfiniteOptions`), plus `queryKeys`, `infiniteQueryKeys`, and `mutationOptions`. The
  plugin targets **TanStack Query v5** (docs link to `tanstack.com/query/v5/...`). Plugin string,
  outputs, and combination are all accurate.
- **Recommended change:** None.
- **Source(s):** GitHub
  `packages/openapi-ts/src/plugins/@tanstack/react-query/{types.ts,config.ts}`; heyapi.dev
  "TanStack Query v5 Plugin".

### 4. Is the TanStack Query plugin "GA"?

- **Location:** Review brief asks "Is the TanStack Query plugin GA?"; PHILOSOPHY.md treats it as a
  production tool.
- **Claim (implied):** The plugin is production-ready / stable.
- **Status:** ⚠️
- **Finding:** There is **no separate GA milestone** for the plugin: it ships under the
  `@hey-api/openapi-ts` umbrella, which is itself **pre-1.0 / "initial development."** The plugin
  is documented, functional, and used in production by large adopters (Vercel, OpenCode, PayPal
  per the README), and is the official recommendation — but it inherits the pre-1.0 stability
  caveat. Calling it "GA" overstates; "stable, recommended, but pre-1.0 (pin exact)" is accurate.
- **Recommended change:** Where any doc implies GA, phrase as "officially recommended, pre-1.0 —
  pin exact." (PHILOSOPHY.md already says "pinned exact, pre-1.0", so this is mainly a framing note.)
- **Source(s):** GitHub `packages/openapi-ts/README.md` ("initial development"); heyapi.dev
  TanStack Query plugin page.

### 5. Generated infinite-options hook name `listItemsInfiniteOptions`

- **Location:** phase-4-typegen.md Step 9 (`import { listItemsInfiniteOptions } ...`), flagged
  ⚠️ OPEN.
- **Claim:** The generated infinite-query options helper for `/v1/items` would be named like
  `listItemsInfiniteOptions`.
- **Status:** ✅ (resolves an OPEN flag)
- **Finding:** Verified. The plugin's default `infiniteQueryOptions.name` template is
  `'{{name}}InfiniteOptions'` with `case: 'camelCase'`. For an operation whose SDK function is
  `listItems` (FastAPI operationId `list_items` → camelCased), the emitted export is exactly
  `listItemsInfiniteOptions`. The guide's assumption is correct, contingent only on the Phase 3
  operationId being `list_items`/`listItems`. Likewise the non-infinite helper would be
  `listItemsOptions` (`'{{name}}Options'`).
- **Recommended change:** Downgrade the ⚠️ OPEN to a note: "name follows `{{name}}InfiniteOptions`
  camelCase from the operationId — verify the operationId, not the plugin behavior."
- **Source(s):** GitHub `packages/openapi-ts/src/plugins/@tanstack/react-query/config.ts`
  (`infiniteQueryOptions: { name: '{{name}}InfiniteOptions' }`, `case: 'camelCase'`).

### 6. `client.setConfig({ baseUrl })` to set the base URL at startup

- **Location:** phase-4-typegen.md Step 8 (`client.setConfig({ baseUrl: env.EXPO_PUBLIC_API_URL })`);
  PHILOSOPHY.md line 290 ("App sets client baseUrl from `EXPO_PUBLIC_API_URL` at startup").
- **Claim:** The bundled fetch client exposes `client.setConfig({ baseUrl })`.
- **Status:** ✅
- **Finding:** Confirmed in the bundled client source: `setConfig` exists and `Config` carries an
  optional `baseUrl?: string`. Calling `client.setConfig({ baseUrl })` once at startup is the
  documented pattern.
- **Recommended change:** None. (The ⚠️ OPEN about the import path is fair — read the actual
  export from generated `src/index.ts`; the shared `client` is exported from the generated
  client per the client-fetch plugin.)
- **Source(s):** GitHub
  `packages/openapi-ts/src/plugins/@hey-api/client-fetch/bundle/{client.ts,types.ts}`.

### 7. `client.interceptors.request.use(...)` to attach the bearer token

- **Location:** phase-6-auth.md Step 5 (`client.interceptors.request.use((request) => { ... request.headers.set("Authorization", ...) })`).
- **Claim:** The fetch client exposes `interceptors.request.use(...)` and the request exposes a
  `headers.set(...)` (Fetch `Headers`) API.
- **Status:** ✅
- **Finding:** Confirmed. The bundled client creates `interceptors` via
  `createInterceptors<Request, Response, ...>()` and iterates `interceptors.request.fns`; the
  `.use()` registration API and a `Request`-typed argument (with standard `headers.set`) are the
  current shape. The interceptor pattern in Phase 6 is accurate.
- **Recommended change:** None.
- **Source(s):** GitHub
  `packages/openapi-ts/src/plugins/@hey-api/client-fetch/bundle/client.ts`.

### 8. The `@hey-api/schemas` / `@hey-api/sdk` / `@hey-api/typescript` plugins in the config

- **Location:** phase-4-typegen.md Step 4 `plugins` array.
- **Claim:** Plugins `@hey-api/schemas`, `@hey-api/sdk`, `@hey-api/typescript` are valid current
  plugin identifiers.
- **Status:** ✅
- **Finding:** Confirmed as current core plugin names. The README enumerates "core plugins for
  SDKs, types, and schemas" and the docs/issue tracker reference `@hey-api/typescript`,
  `@hey-api/sdk`, `@hey-api/schemas` as the plugin strings. The Phase 4 config's plugin set is
  valid. (Minor: `@hey-api/schemas` is optional — only needed if you want runtime JSON-schema
  output; it's harmless to include.)
- **Recommended change:** None required; optionally drop `@hey-api/schemas` if runtime schemas
  aren't consumed, to keep generated output smaller.
- **Source(s):** GitHub `packages/openapi-ts/README.md`; heyapi.dev configuration docs.

### 9. TanStack Query is "current major v5"; `useInfiniteQuery` API

- **Location:** PHILOSOPHY.md line 29, 52 ("`useInfiniteQuery`-ready"); phase-4-typegen.md Step 9
  (`useInfiniteQuery`, `isPending`, `data.pages.flatMap`, `fetchNextPage`, `hasNextPage`).
- **Claim:** TanStack Query v5 is current; `useInfiniteQuery` with `isPending`, `data.pages`,
  `fetchNextPage`, `hasNextPage` is the right API.
- **Status:** ✅
- **Finding:** Confirmed. `@tanstack/react-query` latest is **5.101.0** (published 2026-06-02);
  **there is no React v6** — the only "v6" is the Svelte adapter (`@tanstack/svelte-query` v6,
  running the v5 core). v5 introduced `isPending` (replacing `isLoading` as the "no data yet"
  flag), made `initialPageParam` + `getNextPageParam` **required** for infinite queries, and
  keeps `data.pages` / `fetchNextPage` / `hasNextPage`. The Step 9 usage is v5-correct. Note: the
  generated `...InfiniteOptions()` helper supplies `initialPageParam`/`getNextPageParam` from the
  OpenAPI cursor contract, which is why the screen doesn't hand-write them — accurate.
- **Recommended change:** None.
- **Source(s):** npm registry `@tanstack/react-query` (5.101.0); TanStack "Migrating to v5" and
  "Infinite Queries" docs; TanStack/query release history (June 2026).

### 10. Persistence packages: `@tanstack/react-query-persist-client`,

`@tanstack/query-async-storage-persister`, `@tanstack/query-sync-storage-persister`

- **Location:** PHILOSOPHY.md line 31 (query client "with cache persistence — AsyncStorage native /
  localStorage web"); phase-2-design-system.md step (g) `package.json` + `persist.web.ts`
  (`createSyncStoragePersister` from `@tanstack/query-sync-storage-persister`) +
  `persist.native.ts` (`createAsyncStoragePersister` from
  `@tanstack/query-async-storage-persister`) + `_layout.tsx`
  (`PersistQueryClientProvider` from `@tanstack/react-query-persist-client`).
- **Claim:** These three package names + `createSyncStoragePersister` /
  `createAsyncStoragePersister` / `PersistQueryClientProvider` are correct and current.
- **Status:** ✅
- **Finding:** All confirmed. All three packages exist on npm, current **5.101.0**, **not
  deprecated**, versioned in lockstep with `@tanstack/react-query`. `PersistQueryClientProvider`
  is the documented React component that gates fetching until cache restore — which is exactly
  why the guide's "reload paints instantly" claim (Verify #4) holds. The web persister
  (`createSyncStoragePersister` over `localStorage`) and native persister
  (`createAsyncStoragePersister` over AsyncStorage) split is the canonical TanStack pattern, and
  the `.web/.native` extension resolution is the right RN way to wire it.
- **Recommended change:** None to the package names. Refresh the pinned versions: Phase 2 pins
  `5.62.0` (stale but valid) — bump to the resolved latest (5.101.0 line) at install time.
- **Source(s):** npm registry for all four `@tanstack/*` packages (latest 5.101.0); TanStack
  `persistQueryClient` / `createSyncStoragePersister` / `createAsyncStoragePersister` docs.

### 11. Stale exact version pins for `@tanstack/*` (5.62.0)

- **Location:** phase-2-design-system.md step (g) `packages/core/package.json`
  (`"@tanstack/react-query": "5.62.0"` and the two persisters at `5.62.0`).
- **Claim:** `5.62.0` is the version to pin.
- **Status:** ⚠️
- **Finding:** `5.62.0` is a real, valid v5 release but **stale** (latest 5.101.0, June 2026).
  Not wrong, just dated; the guide itself elsewhere uses `catalog:`/`*` and says to freeze at
  install time, so this is an example pin to refresh.
- **Recommended change:** Update the example pins to the current 5.10x line (or use the pnpm
  `catalog:` the guides reference) so all `@tanstack/*` stay in lockstep.
- **Source(s):** npm registry `@tanstack/react-query` (latest 5.101.0).

### 12. Zustand is current major; `create` + `persist` patterns

- **Location:** PHILOSOPHY.md line 29, 176 (session store = zustand), Decision Sheet; phase-2 step (h)
  `use-theme.ts` (`import { create } from "zustand"`); phase-6 `auth.ts`
  (`import { create } from "zustand"`, store + `getState()`).
- **Claim:** Zustand (current major) with `create(...)` store factory is correct; persist
  middleware available.
- **Status:** ✅
- **Finding:** Confirmed. Zustand latest is **5.0.14** (2026-05-28). `import { create } from
"zustand"` is the v5 entry point; `persist` is imported from `zustand/middleware`;
  `useStore.getState()` (used by `getAccessToken()` in Phase 6) is valid for reading outside
  React. The plan's stores don't actually use Zustand persist (sessions persist via supabase-js
  storage; theme is in-memory) — which is fine and intentional. Nothing in the Zustand usage is
  out of date.
- **Recommended change:** None. Pin exact to the resolved 5.0.x at install (Phase 6 already marks
  it `PLACEHOLDER-pin-exact`).
- **Source(s):** npm registry `zustand` (5.0.14); Zustand v5 persist middleware docs.

### 13. `@react-native-async-storage/async-storage` as the native persister/store backend

- **Location:** phase-2 step (g) `persist.native.ts`; phase-6 `supabase.ts` storage adapter.
- **Claim:** `@react-native-async-storage/async-storage` is the right native storage package.
- **Status:** ✅
- **Finding:** Correct and current — latest **3.1.1** (2026-05-29). Used both as the TanStack
  async persister backend and the supabase-js auth-session adapter on native. Standard choice.
- **Recommended change:** None. (Install via `expo install` so the version matches the SDK, per
  the guides' own note.)
- **Source(s):** npm registry `@react-native-async-storage/async-storage` (3.1.1).

### 14. "TanStack Query plugin beats openapi-typescript + openapi-fetch (no hand-written glue)"

- **Location:** PHILOSOPHY.md line 288–289; phase-4-typegen.md Step 4 "Why".
- **Claim:** The hey-api TanStack plugin generates `queryOptions`/infinite hooks, removing the
  hand-written glue that `openapi-typescript` + `openapi-fetch` requires.
- **Status:** ✅
- **Finding:** Accurate. `openapi-typescript` emits types only and `openapi-fetch` is a thin typed
  fetch wrapper with no React Query integration — you would hand-write `queryOptions`. The hey-api
  TanStack plugin emits those wrappers (incl. infinite) directly. The rationale holds.
- **Recommended change:** None.
- **Source(s):** heyapi.dev TanStack Query plugin docs; openapi-typescript/openapi-fetch project
  scope (types/fetch only).

### 15. "Commit generated output + CI drift check" pattern

- **Location:** PHILOSOPHY.md line 36 ("generated client committed per product"), 289–290 (drift command);
  phase-4-typegen.md DoD, Gotchas "Drift check", Step 5/6 `outputs: ["src/**"]`.
- **Claim:** Commit the generated `src/` per product and guard it with
  `turbo run openapi build ... && git diff --exit-code`.
- **Status:** ✅
- **Finding:** This is a sound, common pattern for codegen-from-contract pipelines and not
  contradicted by hey-api (which has no objection to committing output). Pinning openapi-ts exact
  (Finding 2) is what keeps regeneration byte-stable so the drift check only fires on real
  contract changes; `format: "prettier"` (Step 4) further stabilizes diffs. The design is
  internally consistent. The only subtlety (already flagged ⚠️ in the guide) is that `src/**` is
  both a turbo `output` and git-tracked — acceptable because the drift check regenerates
  regardless of cache.
- **Recommended change:** None.
- **Source(s):** phase-4-typegen.md (self-consistent); general codegen-commit practice;
  heyapi.dev (output is plain files, safe to commit).

### 16. `openapi-ts.config.ts` schema: `defineConfig`, `input`, `output`, `plugins`

- **Location:** phase-4-typegen.md Step 4.
- **Claim:** `import { defineConfig } from "@hey-api/openapi-ts"` with `input`, `output`,
  `plugins` is the current config shape.
- **Status:** ✅
- **Finding:** Correct. `defineConfig` is the documented entry; `input` (path/URL/registry),
  `output` (string or `{ path, format }`), and `plugins` (array of strings or
  `{ name, ...options }`) are all current. The `output: { path: "src", format: "prettier" }`
  form is valid.
- **Recommended change:** None. (Minor: newer docs also accept `output: "src"` shorthand; the
  object form used is fine and lets you set `format`.)
- **Source(s):** GitHub `packages/openapi-ts/README.md` (defineConfig example); heyapi.dev
  configuration docs.

### 17. Node.js runtime requirement for the codegen

- **Location:** PHILOSOPHY.md mise pin "Node 22"; (implicit — codegen runs under the repo's Node).
- **Claim (implicit):** Node 22 is adequate to run `@hey-api/openapi-ts`.
- **Status:** ✅
- **Finding:** Matches exactly — the current openapi-ts README states it "runs in any Node.js 22+
  environment." The repo's Node 22 pin is the minimum and is correct. (Worth noting as a hard
  floor: dropping below Node 22 would break codegen.)
- **Recommended change:** None; optionally note Node 22 is a hard floor for openapi-ts.
- **Source(s):** GitHub `packages/openapi-ts/README.md` ("runs in any Node.js 22+ environment").

### 18. Cursor DTO field names (`items`, `next_cursor`) and cursor query param

- **Location:** phase-4-typegen.md Prerequisites line 44–48, Step 9 (`page.items`,
  `next_cursor`), Open-questions line 783–784; PHILOSOPHY.md line 52 ("cursor pagination
  (`useInfiniteQuery`-ready)").
- **Claim:** The cursor response is `{ items: Item[], next_cursor: string | null }`.
- **Status:** ❓
- **Finding:** Out of this domain's verifiable scope — these names are defined by Phase 3's
  Pydantic `schemas/`, not by any external library, so the web cannot confirm them. The shape is
  a reasonable convention and the guide already flags it ⚠️ OPEN. The only library-side fact
  worth stating: the generated `...InfiniteOptions()` helper derives `getNextPageParam` from the
  OpenAPI **parameter** named as the cursor query param and the response field the spec marks —
  so whatever Phase 3 names them, they must be reflected in the OpenAPI (and the screen reads the
  generated types, not hard-coded names). If the plugin can't infer `getNextPageParam`, supply it
  manually off the response field (the guide already says this).
- **Recommended change:** Keep the ⚠️ OPEN; add: "confirm the cursor **query parameter** name too
  — the plugin's `getNextPageParam` is keyed to it, not just the response field." Match
  `home-screen.tsx`'s `page.items` / `next_cursor` to the actual Phase 3 schema once it exists.
- **Source(s):** N/A external (internal contract); plugin behavior per GitHub
  `packages/openapi-ts/src/plugins/@tanstack/react-query/config.ts`.

---

## Resolved OPEN/TO CONFIRM

- **Exact `@hey-api/openapi-ts` version (Phase 4 OPEN):** **0.98.2** is current latest, pre-1.0.
  Pin that (or the resolved latest at install). [npm registry]
- **Exact `@hey-api/client-fetch` version (Phase 4 OPEN):** **Do not pin / do not install.** The
  package (last 0.13.1) is **deprecated and bundled into `@hey-api/openapi-ts` since v0.73.0**.
  Use `@hey-api/client-fetch` only as a **plugin string**. [npm deprecation field]
- **Exact hey-api plugin identifier set (Phase 4 OPEN):** Confirmed current — client:
  `@hey-api/client-fetch`; SDK: `@hey-api/sdk`; types: `@hey-api/typescript`; schemas
  (optional): `@hey-api/schemas`; TanStack: `@tanstack/react-query`. The TanStack plugin emits
  `infiniteQueryOptions` **by default** (`enabled: true`), with default name template
  `{{name}}InfiniteOptions` (camelCase) and `{{name}}Options` for the non-infinite helper.
  [GitHub plugin `config.ts`/`types.ts`]
- **Generated infinite hook name (Phase 4 OPEN):** **`listItemsInfiniteOptions`** is correct for
  an operation function `listItems` — verified against the default naming template. [GitHub
  plugin `config.ts`]
- **`core/api.ts` imported client symbol (Phase 4 OPEN):** The shared `client` with
  `setConfig({ baseUrl })` and `interceptors.request.use(...)` is real and current; confirm the
  exact export path from generated `src/index.ts` (the client-fetch plugin exports the shared
  `client`). [GitHub client bundle]
- **TanStack Query major (review ask):** **v5** (latest 5.101.0). No React v6 exists; "v6" is the
  Svelte adapter only. The persistence story (`@tanstack/react-query-persist-client` +
  `@tanstack/query-async-storage-persister` native / `@tanstack/query-sync-storage-persister`
  web) is current and not deprecated. [npm registries; TanStack docs]
- **Zustand major (review ask):** **v5** (latest 5.0.14). `create` + `zustand/middleware`
  `persist` patterns valid. [npm registry; Zustand docs]
- **Cursor DTO field names (review ask to flag):** Remains **❓ in-domain unverifiable** — owned by
  Phase 3 `schemas/`. Keep flagged; ensure the cursor **query param** name is confirmed too, as
  the generated `getNextPageParam` keys off it.

---

## Sources

- npm registry — `@hey-api/openapi-ts` (dist-tags: latest 0.98.2): https://www.npmjs.com/package/@hey-api/openapi-ts
- npm registry — `@hey-api/client-fetch` (deprecated; bundled since v0.73.0): https://www.npmjs.com/package/@hey-api/client-fetch
- JSR — `@hey-api/client-fetch`: https://jsr.io/@hey-api/client-fetch
- Hey API — Fetch API Client docs: https://heyapi.dev/openapi-ts/clients/fetch
- Hey API — TanStack Query v5 Plugin docs: https://heyapi.dev/openapi-ts/plugins/tanstack-query
- Hey API — Configuration docs: https://heyapi.dev/openapi-ts/configuration
- Hey API — Migrating docs: https://heyapi.dev/openapi-ts/migrating
- GitHub — hey-api/openapi-ts README: https://github.com/hey-api/openapi-ts
- GitHub — hey-api/openapi-ts (raw) `packages/openapi-ts/README.md`: https://raw.githubusercontent.com/hey-api/openapi-ts/main/packages/openapi-ts/README.md
- GitHub — TanStack plugin types: https://github.com/hey-api/openapi-ts/blob/main/packages/openapi-ts/src/plugins/@tanstack/react-query/types.ts
- GitHub — TanStack plugin default config (raw): https://raw.githubusercontent.com/hey-api/openapi-ts/main/packages/openapi-ts/src/plugins/@tanstack/react-query/config.ts
- GitHub — client-fetch plugin config (raw): https://raw.githubusercontent.com/hey-api/openapi-ts/main/packages/openapi-ts/src/plugins/@hey-api/client-fetch/config.ts
- GitHub — client-fetch bundle client.ts/types.ts (raw): https://raw.githubusercontent.com/hey-api/openapi-ts/main/packages/openapi-ts/src/plugins/@hey-api/client-fetch/bundle/client.ts
- npm registry — `@tanstack/react-query` (5.101.0): https://www.npmjs.com/package/@tanstack/react-query
- npm registry — `@tanstack/react-query-persist-client` (5.101.0): https://www.npmjs.com/package/@tanstack/react-query-persist-client
- npm registry — `@tanstack/query-async-storage-persister` (5.101.0): https://www.npmjs.com/package/@tanstack/query-async-storage-persister
- npm registry — `@tanstack/query-sync-storage-persister` (5.101.0): https://www.npmjs.com/package/@tanstack/query-sync-storage-persister
- TanStack Query — Migrating to v5: https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-v5
- TanStack Query — Infinite Queries: https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries
- TanStack Query — persistQueryClient: https://tanstack.com/query/v5/docs/framework/react/plugins/persistQueryClient
- TanStack/query releases (June 2026): https://github.com/tanstack/query/releases
- npm registry — `zustand` (5.0.14): https://www.npmjs.com/package/zustand
- npm registry — `@react-native-async-storage/async-storage` (3.1.1): https://www.npmjs.com/package/@react-native-async-storage/async-storage
