# Phase 4 — OpenAPI→TS typegen & API-backed home screen

**Goal:** Wire the contract pipeline end to end. The FastAPI service (built in Phase 3)
emits a stable `openapi.json`; a committed, generated `@platform/template-api-client`
workspace turns that contract into a typed SDK plus TanStack Query hooks via
`@hey-api/openapi-ts` (+ `@hey-api/client-fetch` + the TanStack Query plugin); Turborepo
orders the work `openapi → api-client#build → app build/export:web` from **real dependency
edges**; and `features/home` renders the cursor-paginated `/v1/items` through a generated
`useInfiniteQuery` hook, cache-persisted so a reload paints instantly.

This is the concrete expansion of the PLAN.md **Phase 4** row:

> Typegen: `export_openapi.py`, `api-client/` (hey-api), turbo wiring; `features/home`
> list screen renders the cursor-paginated `/v1/items` via generated `useInfiniteQuery`
> hook (cache-persisted).

**Verify (restated from PLAN.md):**
1. `turbo run build --filter=*template-app` shows **openapi → client → app** order.
2. A model change (edit a Pydantic response DTO) **regenerates types**.
3. Web **renders paginated API data**.
4. **Reload shows cached data instantly** (TanStack Query cache persistence).

This guide is faithful to PLAN.md's locked decisions (Decision Sheet "Contracts" bullet,
the turbo.json notes, the "Typegen" subsection of Config essentials, the `api-client/`
and `features/home` directory trees, the Contract testing row, and Key ruling #1 —
"a product = 3 workspaces + generated `api-client`"). Anything PLAN.md does not pin is
marked **⚠️ OPEN / TO CONFIRM**.

---

## Prerequisites

- **Phase 3 complete** — `products/_template/api` is a working FastAPI service in strict
  layered OOP shape (`models/ → services/ → schemas/ → routers/`). It exposes
  `/healthz`, `/v1/hello`, and `/v1/items` CRUD with **cursor pagination**
  (`useInfiniteQuery`-ready), **RFC 9457 problem+json** errors typed into OpenAPI, and a
  `src/template_api/export_openapi.py` module. `pyright` is clean in strict mode.
- **Phase 2 complete** — `packages/core` ships `query.ts` (the TanStack Query client
  **with cache persistence** — AsyncStorage native / localStorage web) and `env.ts`; the
  `_template/app` shell (`@platform/template-app`) has tab navigation, NativeWind theming,
  and a settings screen. `app/_layout.tsx` already mounts the query (+ persist) provider.
- **Phase 1 root tooling** — pnpm workspaces, Turborepo 2.9, `tsconfig.base.json`,
  `node-linker=hoisted`, mise pins (Node 22 / pnpm 10 / Python 3.13 / uv).
- The cursor-pagination response shape from Phase 3 is the contract this phase consumes.
  PLAN.md fixes it as `useInfiniteQuery`-ready but does **not** pin exact field names.
  This guide assumes `{ items: Item[], next_cursor: string | null }`. The **exact DTO
  field names** are **⚠️ OPEN / TO CONFIRM** — read them from Phase 3's `schemas/` and
  match them in `features/home`.

---

## Definition of done

- [ ] `api/src/template_api/export_openapi.py` writes `app.openapi()` to
      `products/_template/api/openapi.json` with **sorted keys** (stable diffs), **without
      starting a server**.
- [ ] `api/package.json` has an `openapi` script that runs that module via `uv run`.
- [ ] `products/_template/api-client` exists as the workspace `@platform/template-api-client`,
      **devDepends on `@platform/template-api`** (the edge that makes turbo order it after
      `openapi`), and contains `openapi-ts.config.ts` with `input: ../api/openapi.json`.
- [ ] `openapi-ts.config.ts` uses `@hey-api/client-fetch` **+ the TanStack Query plugin**,
      emitting `sdk` / `types` / TanStack hooks (`queryOptions`, `infiniteQueryOptions`)
      into `src/`.
- [ ] `@hey-api/openapi-ts` and `@hey-api/client-fetch` are **pinned exact** (pre-1.0).
- [ ] The generated `src/` output is **committed**.
- [ ] A package-level `api-client/turbo.json` declares `build` with
      `dependsOn: ["^openapi", "^build"]`.
- [ ] Root `turbo.json` declares the `openapi` task (Python `inputs` globs +
      `outputs: ["openapi.json"]`) and the `api-client#build` ordering follows from real
      dep edges.
- [ ] `@platform/template-app` declares a `workspace:*` dependency on
      `@platform/template-api-client`.
- [ ] `core/api.ts` sets the generated client `baseUrl` from `EXPO_PUBLIC_API_URL` at app
      startup.
- [ ] `features/home` renders `/v1/items` via the generated `useInfiniteQuery` hook with
      loading / error / empty states and infinite scroll; data is cache-persisted.
- [ ] `app/(tabs)/index.tsx` is a **thin one-liner** re-exporting the home screen.
- [ ] All four Verify checks pass (see **Verification**).

---

## Build steps

> Paths are relative to repo root `<root>/`. Names are **exact**: `@platform/template-api`,
> `@platform/template-api-client`, `@platform/template-app`, `EXPO_PUBLIC_API_URL`.
> The literal product name token is `template` (Key ruling #7) — the generator
> whole-word-rewrites it for stamped products.

### Step 1 — Confirm `export_openapi.py` emits a stable, server-free `openapi.json`

**Files**
- `products/_template/api/src/template_api/export_openapi.py`

**Contents**
```python
"""Dump the FastAPI OpenAPI document to a stable JSON file (no server needed).

PLAN.md (Config essentials → export_openapi.py): writes app.openapi() JSON with sorted
keys for stable diffs. This is the source the hey-api client is generated from, and the
artifact the CI drift check compares.
"""

from __future__ import annotations

import json
from pathlib import Path

from template_api.main import app

# openapi.json lives at the api workspace root: products/_template/api/openapi.json
# __file__ = .../api/src/template_api/export_openapi.py  -> parents[2] = .../api
OUTPUT = Path(__file__).resolve().parents[2] / "openapi.json"


def main() -> None:
    schema = app.openapi()
    # sort_keys=True => byte-stable diffs; trailing newline => clean git diff.
    OUTPUT.write_text(
        json.dumps(schema, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {OUTPUT}")


if __name__ == "__main__":
    main()
```

**Commands**
```bash
# From the api workspace; uv run resolves the project venv without a live server.
cd products/_template/api && uv run python -m template_api.export_openapi
```

**Why**
PLAN.md fixes `export_openapi.py` as "writes `app.openapi()` JSON, sorted keys (stable
diffs), no server needed." Importing `app` and calling `app.openapi()` builds the schema
in-process — no uvicorn, no port, no DB. `sort_keys=True` guarantees byte-stable output so
the committed `openapi.json` and the generated client only change when the **contract**
changes — which is exactly what the Contract testing row (`git diff --exit-code`) relies
on. Deriving `OUTPUT` from `__file__` keeps it correct after the generator renames paths.

---

### Step 2 — Add the `openapi` script to the api workspace `package.json`

**Files**
- `products/_template/api/package.json`

**Contents** (the `api/` package.json is "only a script shim so Turborepo can orchestrate
`uv run` tasks" — Package management model table)
```json
{
  "name": "@platform/template-api",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "uv run uvicorn template_api.main:app --reload --port 8000",
    "lint": "uv run ruff check . && uv run ruff format --check .",
    "typecheck": "uv run pyright",
    "test": "uv run pytest",
    "openapi": "uv run python -m template_api.export_openapi"
  }
}
```

**Commands**
```bash
pnpm --filter @platform/template-api run openapi
# equivalently, through the task graph:
pnpm turbo run openapi --filter=@platform/template-api
```

**Why**
Turborepo only orchestrates JS-script tasks; the `api/` `package.json` exists purely to
expose `uv run` commands to the graph (Package management model). The `openapi` script is
the task Turbo runs whose **output** is `openapi.json` — the input to `api-client#build`.
Port `8000` here is the template's `portIndex=0` value; the generator rewrites it to
`8000 + 10*i` per product.

---

### Step 3 — Create the `@platform/template-api-client` workspace `package.json`

**Files**
- `products/_template/api-client/package.json`

**Contents**
```json
{
  "name": "@platform/template-api-client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "openapi-ts",
    "generate": "openapi-ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@hey-api/client-fetch": "0.x.y",
    "@tanstack/react-query": "catalog:"
  },
  "devDependencies": {
    "@hey-api/openapi-ts": "0.x.y",
    "@platform/template-api": "workspace:*",
    "@platform/config": "workspace:*",
    "typescript": "catalog:"
  }
}
```

> **⚠️ OPEN / TO CONFIRM — exact versions.** PLAN.md mandates `@hey-api/openapi-ts`
> "pinned exact, pre-1.0" and `@hey-api/client-fetch`; replace `0.x.y` with the exact
> resolved pre-1.0 versions (no `^`/`~`). `catalog:` assumes a pnpm catalog from Phase 1
> for shared TS/React Query versions — if no catalog exists, pin the same exact version
> the app uses.

**Commands**
```bash
mkdir -p products/_template/api-client/src
# package.json written, then:
pnpm install   # links the workspace deps under the single hoisted node_modules
```

**Why**
Key ruling #1: "A product = 3 workspaces (`app`, `desktop`, `api`) + generated
`api-client`." This is that fourth workspace. The **critical line** is
`"@platform/template-api": "workspace:*"` in `devDependencies`: PLAN.md's turbo notes say
"Dependency edges come from real `dependencies`/`devDependencies` (`api-client` devDepends
on its `api`...)." That real edge is what makes Turbo schedule the api's `openapi` task
**before** this package's `build`. The package is consumed **as source** (`main`/`types`
point at `src/index.ts`, no separate build artifact — same no-build pattern as
`packages/ui`), and the generated `src/` is committed (Contracts decision).

---

### Step 4 — Author `openapi-ts.config.ts`

**Files**
- `products/_template/api-client/openapi-ts.config.ts`

**Contents**
```ts
import { defineConfig } from "@hey-api/openapi-ts";

// PLAN.md (api-client/ tree): input ../api/openapi.json; output committed under src/.
// Plugins: @hey-api/client-fetch + the TanStack Query plugin (generates queryOptions /
// infiniteQueryOptions + a typed SDK), which PLAN.md picks over
// openapi-typescript + openapi-fetch precisely because it needs no hand-written glue.
export default defineConfig({
  input: "../api/openapi.json",
  output: {
    path: "src",
    format: "prettier", // keep generated output consistent with repo Prettier config
  },
  plugins: [
    "@hey-api/client-fetch",
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
      // which features/home consumes via useInfiniteQuery.
    },
  ],
});
```

> **⚠️ OPEN / TO CONFIRM — exact plugin identifiers & options.** PLAN.md fixes the
> *combination* (`@hey-api/client-fetch` + TanStack Query plugin generating
> `queryOptions`) but not the precise plugin string set for the pinned pre-1.0 version.
> Confirm against the installed `@hey-api/openapi-ts` version's plugin API and lock it.
> The cursor param name that drives `infiniteQueryOptions` `getNextPageParam` is whatever
> `/v1/items` declares in Phase 3 (**⚠️ OPEN / TO CONFIRM**).

**Commands**
```bash
cd products/_template/api-client && pnpm run generate   # runs `openapi-ts`
git add products/_template/api-client/src                # commit generated output
```

**Why**
This is the heart of the Contracts decision: FastAPI OpenAPI → `@hey-api/openapi-ts` +
TanStack Query plugin, generated client committed per product. `input: "../api/openapi.json"`
ties the client to its sibling api's emitted contract (matches the directory tree).
`format: "prettier"` keeps generated diffs reviewable and consistent with the repo's
Prettier config so the drift check only flags real contract changes.

---

### Step 5 — Add the package-level `api-client/turbo.json`

**Files**
- `products/_template/api-client/turbo.json`

**Contents**
```json
{
  "extends": ["//"],
  "tasks": {
    "build": {
      "dependsOn": ["^openapi", "^build"],
      "inputs": ["openapi-ts.config.ts", "../api/openapi.json"],
      "outputs": ["src/**"]
    }
  }
}
```

**Why**
PLAN.md, verbatim: "`api-client#build` runs openapi-ts (`dependsOn: ["^openapi","^build"]`
via package-level turbo.json)." The `^openapi` edge means "run the `openapi` task of my
dependencies first" — and because Step 3 made the api a real workspace dependency, that
resolves to `@platform/template-api`'s `openapi` task, producing `../api/openapi.json`
**before** this build reads it. `^build` covers any other built dependency. `inputs`
includes the config and the consumed contract so a contract change re-triggers
generation; `outputs: ["src/**"]` is the generated client (caching keys off it).
`extends: ["//"]` inherits the root pipeline.

> **⚠️ OPEN / TO CONFIRM:** treating the committed `src/**` as a turbo `output` is correct
> for cache restoration, but it is **also tracked in git**. The drift check (Gotchas)
> regenerates and `git diff --exit-code`s regardless, so a stale cache restore cannot mask
> a real contract change in CI. Confirm the team is comfortable with generated output
> being both a turbo output and committed.

---

### Step 6 — Wire the root `turbo.json` tasks

**Files**
- `turbo.json` (repo root)

**Contents** (the Phase-4-relevant tasks; merge into the existing pipeline — do **not**
drop tasks added in earlier phases)
```json
{
  "$schema": "https://turborepo.com/schema.json",
  "tasks": {
    "openapi": {
      "inputs": ["src/**/*.py", "pyproject.toml", "uv.lock"],
      "outputs": ["openapi.json"]
    },
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".expo/**", "src/**"]
    },
    "export:web": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "api-client#build": {
      "dependsOn": ["^openapi", "^build"],
      "inputs": ["openapi-ts.config.ts", "../api/openapi.json"],
      "outputs": ["src/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

> The `api-client#build` block above mirrors the package-level `turbo.json` from Step 5.
> PLAN.md describes the ordering "`api-client#build` runs openapi-ts ... **via
> package-level turbo.json**", so the package-level file (Step 5) is authoritative; the
> root `api-client#build` entry is optional belt-and-suspenders. Keep them **identical**
> if you declare both, or rely solely on Step 5. **⚠️ OPEN / TO CONFIRM** which single
> location the team standardizes on.

**Commands**
```bash
pnpm turbo run build --filter=@platform/template-app --dry=json | less   # inspect order
```

**Why**
The `openapi` task's `inputs` globs are **mandatory** — PLAN.md: "Python `inputs` globs
are mandatory or caching is wrong." Without them Turbo can't tell when the Python source
changed, so it would serve a stale cached `openapi.json` and a model change would silently
fail to regenerate types (breaking Verify #2). `outputs: ["openapi.json"]` registers the
artifact. App `build`/`export:web` `dependsOn: ["^build"]` pulls the api-client (a real
dep of the app, Step 7) into the graph ahead of the app — completing the
`openapi → api-client#build → app build/export:web` chain entirely from real dependency
edges, no hand-wired topology.

---

### Step 7 — Make the app depend on the generated client

**Files**
- `products/_template/app/package.json`

**Contents** (add the dependency; existing fields elided)
```json
{
  "name": "@platform/template-app",
  "dependencies": {
    "@platform/template-api-client": "workspace:*",
    "@platform/core": "workspace:*",
    "@platform/ui": "workspace:*",
    "@tanstack/react-query": "catalog:"
  }
}
```

**Commands**
```bash
pnpm install   # relinks; the workspace:* edge now feeds the turbo graph
```

**Why**
This `workspace:*` edge is the second real dependency that drives ordering: it is why the
app's `build`/`export:web` (with `dependsOn: ["^build"]`) waits for `api-client#build`,
which in turn waits for the api's `openapi`. PLAN.md's whole ordering claim
("Dependency edges come from real `dependencies`/`devDependencies`") rests on edges like
this one. It also makes the generated hooks importable from app code as
`@platform/template-api-client`.

---

### Step 8 — Wire the client baseUrl in `core/api.ts`

**Files**
- `packages/core/src/api.ts`
- `packages/core/src/env.ts` (already present from Phase 2 — referenced, not rewritten)
- `packages/core/src/index.ts` (export `configureApiClient`)

**Contents** (`packages/core/src/api.ts` — Phase 4 scope: baseUrl from
`EXPO_PUBLIC_API_URL`; the auth-header and `X-Request-Id` injection land in Phases 6/8)
```ts
// PLAN.md (Config essentials → Typegen): "App sets client baseUrl from EXPO_PUBLIC_API_URL
// at startup." packages/core (api.ts) is the client wrapper: baseUrl, auth header,
// X-Request-Id injection. This phase wires baseUrl only.
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
    baseUrl: env.EXPO_PUBLIC_API_URL,
  });
  configured = true;
}
```

> **⚠️ OPEN / TO CONFIRM — the imported client symbol.** `@hey-api/client-fetch` exposes a
> shared `client` whose `setConfig` sets `baseUrl`; the exact import path
> (`@platform/template-api-client` barrel vs a `/client` subpath) depends on the pinned
> hey-api version's output layout. Confirm against generated `src/index.ts`.
> **Generic-client coupling note:** the `core` package importing the **template-specific**
> client is acceptable in the template (Phase 4 wiring); when promoting `core` toward a
> truly shared package, the client should be injected rather than imported by name. PLAN.md
> does not pin this seam — **⚠️ OPEN / TO CONFIRM** the long-term injection shape.

**Commands**
```bash
# EXPO_PUBLIC_API_URL is read from the committed per-env file (Phase 2/3), e.g.
# products/_template/app/.env.development -> EXPO_PUBLIC_API_URL=http://localhost:8000
pnpm --filter @platform/template-app exec expo start --web
```

**Why**
The generated SDK/hooks call through one shared fetch client; its `baseUrl` must point at
the running api. PLAN.md fixes the source of that URL as `EXPO_PUBLIC_API_URL` (the
publishable, per-env, committed env var — `EXPO_PUBLIC_*` is the only frontend config
class allowed). Configuring once at startup (idempotent guard) means every generated hook
shares the right base. Per the env decision, the dev value (port `8000` for `portIndex=0`)
lives in `app/.env.development`, written by Phase 2/3 and re-ported by the generator.

---

### Step 9 — Build the `features/home` list screen

**Files**
- `products/_template/app/features/home/home-screen.tsx`
- (optional) `products/_template/app/features/home/components/item-row.tsx`

**Contents** (`home-screen.tsx`)
```tsx
// PLAN.md (features/home tree): "list screen via generated API hooks".
// Renders cursor-paginated /v1/items through the generated useInfiniteQuery hook.
// Loading / error / empty states; cache-persisted (the persister is configured in
// packages/core query.ts from Phase 2, so a reload paints cached pages instantly).
import { FlashList } from "@shopify/flash-list";
import { ActivityIndicator, RefreshControl, View } from "react-native";
import { Text } from "@platform/ui";
// Generated TanStack Query plugin export. EXACT name depends on the route operationId
// from Phase 3 (e.g. listItemsInfiniteOptions). ⚠️ OPEN / TO CONFIRM the generated name.
import { listItemsInfiniteOptions } from "@platform/template-api-client";
import { useInfiniteQuery } from "@tanstack/react-query";

export function HomeScreen() {
  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    // The generated infinite-options helper wires queryKey, queryFn, initialPageParam,
    // and getNextPageParam from the OpenAPI cursor contract. If the generator does not
    // emit getNextPageParam, supply it here off the response's next_cursor field
    // (field name is ⚠️ OPEN / TO CONFIRM against Phase 3 schemas).
    ...listItemsInfiniteOptions(),
  });

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center gap-2 bg-background p-6">
        {/* RFC 9457 problem+json is typed; surface its title. */}
        <Text className="text-destructive">Couldn’t load items</Text>
        <Text className="text-muted-foreground">{String(error)}</Text>
        <Text className="text-primary" onPress={() => void refetch()}>
          Tap to retry
        </Text>
      </View>
    );
  }

  // Flatten cursor pages. `items` is the page array field (⚠️ OPEN / TO CONFIRM name).
  const items = data.pages.flatMap((page) => page.items);

  if (items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-muted-foreground">No items yet</Text>
      </View>
    );
  }

  return (
    <FlashList
      data={items}
      keyExtractor={(item) => item.id}
      estimatedItemSize={64}
      contentContainerClassName="bg-background"
      renderItem={({ item }) => (
        <View className="border-b border-border p-4">
          <Text className="text-foreground">{item.title}</Text>
        </View>
      )}
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
      }}
      ListFooterComponent={
        isFetchingNextPage ? <ActivityIndicator className="py-4" /> : null
      }
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
      }
    />
  );
}
```

> **⚠️ OPEN / TO CONFIRM:**
> - The generated hook/options name (`listItemsInfiniteOptions` here) follows from the
>   `/v1/items` operationId and the hey-api TanStack plugin's naming — read it from the
>   generated `src/` after Step 4.
> - The response field names (`items`, `next_cursor`) and the `Item` field used as title
>   (`title`) come from Phase 3's `schemas/` — match them exactly.
> - **FlashList vs FlatList:** PLAN.md's `features/home` tree says only "list screen via
>   generated API hooks." It does not pin `@shopify/flash-list`. If FlashList isn't an
>   accepted dependency, swap to RN's built-in `FlatList` (same props for the bits used
>   here). **⚠️ OPEN / TO CONFIRM.**

**Commands**
```bash
mkdir -p products/_template/app/features/home
pnpm --filter @platform/template-app run typecheck
```

**Why**
This is the screen the Verify row demands: cursor-paginated `/v1/items` through the
**generated** `useInfiniteQuery` hook. Consuming the generated infinite-options helper
(rather than hand-writing fetch glue) is the entire reason PLAN.md chose the hey-api
TanStack plugin over `openapi-typescript + openapi-fetch`. The three states (loading /
error / empty) plus infinite scroll satisfy the rich-starter expectation; cache
persistence is inherited from `packages/core`'s `query.ts` (Phase 2), so no extra wiring is
needed here for Verify #4. Styling uses semantic-token classes only
(`bg-background`, `text-foreground`, `border-border`, `text-destructive`) per the
tokens-only invariant — never hex.

---

### Step 10 — Make the route file a thin one-liner

**Files**
- `products/_template/app/app/(tabs)/index.tsx`

**Contents**
```tsx
// Expo Router route files stay thin one-liners (Decision Sheet: "route files stay thin
// one-liners"); all logic lives in features/home.
export { HomeScreen as default } from "../../features/home/home-screen";
```

**Why**
The Code-sharing decision and the directory tree both mandate that
`app/(tabs)/index.tsx` is a thin re-export — product-local feature logic lives under
`features/`, routes only wire navigation. This keeps the rich starter's screens promotable
into `packages/*` later without dragging routing concerns along.

---

## Gotchas & pitfalls

- **NEVER hand-edit the generated client.** Everything under
  `products/*/api-client/src/**` is machine-generated by `openapi-ts`. Edits are silently
  destroyed on the next regen and will fail the drift check. This is one of the root
  CLAUDE.md invariants ("never-edit-generated-client"). To change the client, change the
  **contract** (a Pydantic model/route in the api) and regenerate.

- **Drift check is the contract guard.** PLAN.md's exact command:
  ```bash
  turbo run openapi build --filter=*api-client* && \
    git diff --exit-code products/*/api-client products/*/api/openapi.json
  ```
  Run in CI on every PR (Contract testing row). If a contributor changed a DTO but didn't
  regenerate, the regen produces a diff and `git diff --exit-code` returns non-zero →
  CI red. Stale `openapi.json` fails the check (Phase 8 verify echoes this).

- **Turbo ordering depends on REAL dep edges — don't fake it.** The
  `openapi → api-client#build → app build` chain only holds because (a) `api-client`
  devDepends on `@platform/template-api` and (b) `app` depends on
  `@platform/template-api-client` (both `workspace:*`). `dependsOn: ["^openapi", "^build"]`
  means "run that task on my dependencies." Remove either dependency and the graph
  silently reorders/parallelizes, producing stale generation. Verify with
  `turbo run build --filter=@platform/template-app --dry=json`.

- **Python `inputs` globs on the `openapi` task are mandatory.** PLAN.md: "Python `inputs`
  globs are mandatory or caching is wrong." Without
  `["src/**/*.py","pyproject.toml","uv.lock"]`, Turbo treats the openapi task as
  cacheable-with-no-key and a model change won't bust the cache — Verify #2 fails
  silently. This is the single most common typegen-pipeline footgun.

- **Pin hey-api EXACT (pre-1.0).** Both `@hey-api/openapi-ts` and `@hey-api/client-fetch`
  are pre-1.0; pin exact (no `^`/`~`). A patch bump can change generated output shape and
  produce a spurious drift diff for everyone. This matches the broader "pin pre-1.0 tools
  exactly" stance (also applied to `@rn-primitives/*`).

- **Regenerate on every model change.** The recipe (api CLAUDE.md, ruling #10) is
  `model → service → schema → router → openapi → typegen → hook → screen`. The `openapi`
  and `typegen` steps are not optional: after touching any DTO, run
  `pnpm --filter @platform/template-api run openapi` then regen the client and **commit**
  both the new `openapi.json` and the new `src/`.

- **`export_openapi.py` must not start a server.** It imports `app` and calls
  `app.openapi()` — purely in-process. If it ever needed a DB connection or live port,
  CI/drift would require a running Postgres just to generate types. Keep schema
  construction side-effect-free.

---

## Verification

Run from repo root unless noted. Expected results are stated per command.

**1. Task ordering — `turbo run build --filter=*template-app` shows openapi → client → app**
```bash
# Inspect the planned graph (no execution):
pnpm turbo run build --filter=@platform/template-app --dry=json \
  | jq '.tasks[] | {task: .taskId, deps: .dependencies}'
# Then run for real:
pnpm turbo run build --filter=@platform/template-app
```
Expected: the dry run shows `@platform/template-api#openapi` as a dependency (transitively)
of `@platform/template-api-client#build`, which is a dependency of
`@platform/template-app#build`. The real run prints tasks in the order **openapi →
api-client build → app build** (api-client build never starts before openapi finishes).

**2. Model change regenerates types**
```bash
# Edit a Pydantic response DTO, e.g. add a field to the Item read schema:
#   products/_template/api/src/template_api/schemas/items.py
#   class ItemRead(...): ...  +  description: str | None = None
pnpm turbo run openapi build --filter=@platform/template-api-client
git status --porcelain products/_template/api/openapi.json products/_template/api-client/src
git diff products/_template/api-client/src
```
Expected: `openapi.json` changes (new field in the schema), and the generated
`api-client/src` types change (the new field appears on the generated `Item`/`ItemRead`
type). A diff is present. Committing both keeps the contract green; **not** regenerating
would leave a diff that fails the CI drift check.

**3. Web renders paginated API data**
```bash
# Terminal A — run the api (Phase 3), Supabase local up if required:
pnpm --filter @platform/template-api run dev      # http://localhost:8000
# seed some items so the list is non-empty:
cd products/_template/api && uv run python -m template_api.seed && cd -
# Terminal B — run the app on web:
pnpm --filter @platform/template-app exec expo start --web   # http://localhost:8081
```
Expected: the home tab shows the items list fetched from `/v1/items`. Scrolling to the
bottom triggers `fetchNextPage` and loads the next cursor page (footer spinner, then more
rows). An empty DB shows the "No items yet" empty state; a stopped api shows the error
state with a retry.

**4. Reload shows cached data instantly**
```bash
# With the web app showing items, hard-reload the browser tab (Cmd/Ctrl-R).
```
Expected: the list paints **immediately** from the persisted cache (no loading spinner
flash) and then revalidates in the background. This proves the `packages/core` query
persister (localStorage on web / AsyncStorage on native) is in effect for the generated
hook's query keys. **⚠️ OPEN / TO CONFIRM:** the exact `maxAge`/`gcTime` for persistence is
set in Phase 2's `query.ts`, not here.

**Bonus — CI drift check (Contract testing row), run locally:**
```bash
pnpm turbo run openapi build --filter=*api-client* && \
  git diff --exit-code products/*/api-client products/*/api/openapi.json
```
Expected: exit code 0 (no diff) when the committed client matches the contract; non-zero
if anything is stale.

---

## Commits

Per PLAN.md "Each phase = one commit (or a few logical commits) on a feature branch."
Suggested split on a `phase-4-typegen` branch:

1. **`feat(template-api): stable server-free openapi export`** — confirm/finish
   `export_openapi.py` (sorted-keys, no server) + `openapi` script in `api/package.json` +
   committed initial `openapi.json`. (Steps 1–2)
2. **`feat(template-api-client): generated hey-api client + tanstack hooks`** — new
   `@platform/template-api-client` workspace: `package.json` (exact-pinned hey-api,
   `workspace:*` devDep on the api), `openapi-ts.config.ts`, package-level `turbo.json`,
   and the **committed generated `src/`**. (Steps 3–5)
3. **`chore(turbo): openapi → api-client → app task ordering`** — root `turbo.json`
   `openapi` task (inputs/outputs) + app `workspace:*` dep on the client. (Steps 6–7)
4. **`feat(template-app): API-backed home list via generated useInfiniteQuery`** —
   `core/api.ts` baseUrl wiring, `features/home` screen, thin `(tabs)/index.tsx` route.
   (Steps 8–10)

> Commit ordering matters: generated `src/` and `openapi.json` are committed artifacts —
> include them in the same commit as the config that produced them so each commit is
> internally drift-clean.

---

## Open questions / deferred

- **Exact pre-1.0 versions** of `@hey-api/openapi-ts` and `@hey-api/client-fetch` — pin
  exact at install time. **⚠️ OPEN / TO CONFIRM.**
- **Exact hey-api plugin identifier set & options** for the pinned version (the precise
  strings for client-fetch / sdk / typescript / TanStack Query plugin and whether
  `infiniteQueryOptions` + `getNextPageParam` are emitted automatically). **⚠️ OPEN / TO
  CONFIRM** against generated output.
- **Cursor contract field names** (`items`, `next_cursor`, the cursor query param) and the
  `Item` DTO fields — defined by Phase 3's `schemas/`; match them. **⚠️ OPEN / TO CONFIRM.**
- **FlashList vs FlatList** for the list — PLAN.md doesn't pin a list component; confirm
  whether `@shopify/flash-list` is an accepted app dependency. **⚠️ OPEN / TO CONFIRM.**
- **`core/api.ts` ↔ template-client coupling** — importing the template-specific client by
  name into `packages/core` is fine for the template; the injection seam for a future
  shared `core` is unspecified. **⚠️ OPEN / TO CONFIRM.**
- **Single vs duplicated `api-client#build` declaration** (package-level `turbo.json`
  alone vs also in root) — standardize on one. **⚠️ OPEN / TO CONFIRM.**
- **Query persistence tuning** (`maxAge`, `gcTime`, dehydrate filters) lives in Phase 2's
  `query.ts`; not re-specified here. **Deferred to Phase 2.**
- **Auth header + `X-Request-Id` injection** in `core/api.ts` — PLAN.md assigns these to
  Phases 6 (auth) and 8 (observability), not Phase 4. **Deferred.**
- **`pnpm catalog`** existence for shared TS/React Query versions assumed from Phase 1; if
  absent, pin exact versions inline. **⚠️ OPEN / TO CONFIRM.**
