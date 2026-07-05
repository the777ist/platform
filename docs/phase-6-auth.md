# Phase 6 — Supabase auth, route guards & storage

**Goal:** Bring the template product's **authentication** loop online end-to-end. Stand up
the **per-product Supabase local stack** (`supabase start`), add the shared **auth plumbing**
to `@platform/core` (a Supabase client factory, a Zustand **session store** wired to
`onAuthStateChange`, and Expo Router **route guards**), build the **product-local** auth
screens (`app/features/auth/` login + signup, with thin `(auth)/` route files) per Key ruling
#9, protect the FastAPI **`/v1/me`** endpoint with the `CurrentUser` dependency from Phase 3
(JWKS as the **primary** verification path on **all** environments including local, with HS256
as a genuine fallback only, Key ruling #5), and add `core/storage.ts` + an **avatar upload
demo** on the settings screen (direct-to-Storage upload via `supabase-js`).

This is the first phase where the frontend talks to Supabase directly. Per the locked
**Topology** decision, `supabase-js` on the frontend is used **ONLY for auth / Realtime /
Storage** — core data still flows through FastAPI, which verifies the Supabase-issued JWT.

**Verify (restated from the Phase 6 row):**

> `supabase start`; sign up through the template's login screen; guarded tabs redirect when
> signed out; bearer-token curl → user id; bad token → 401; avatar uploads and renders back
> from Storage.

Concretely:

- `supabase start` brings up the local stack on the template's **offset ports** (base 54321,
  `portIndex 0`).
- The login/signup screens (rendered on web at `localhost:8081`) create a real Supabase user.
- The `(tabs)` group **redirects to `(auth)/login`** when there is no session, and redirects
  the other way once signed in — without flicker on cold start (loading state handled).
- A `curl` to `/v1/me` with a valid bearer token returns the authenticated **user id**; a bad
  token returns **401** as RFC 9457 problem+json.
- Picking an image on settings uploads it **direct-to-Storage** and the screen renders it back
  from the returned public/signed URL.

---

## Prerequisites

Phase 6 builds on Phases **2–4** and the **api** scaffold from Phase 3. Before starting,
confirm:

1. **Phase 2 done** — `packages/ui` ships owned primitives (`Button`, `Text`, `Input`,
   `Card`) consuming semantic tokens; `packages/core` exists with the **query client +
   persistence** (`query.ts`) and **env** (`env.ts`) modules; the `_template/app` shell has
   tab navigation + a settings screen with the theme toggle, and `app/_layout.tsx` already
   wraps the tree in the theme + query providers. This phase **extends** that `_layout.tsx`
   with the auth provider + error boundary, and adds the avatar block to the settings screen.
2. **Phase 3 done** — `_template/api` runs with `auth.py` scaffolded: the `CurrentUser`
   dependency, JWKS verification via `PyJWKClient` (ES256/RS256, cached) as the **primary path
   on all environments (including local)**, plus an **HS256 + `SUPABASE_JWT_SECRET` fallback**
   for older CLI / self-hosted symmetric secrets / manually-minted test tokens (Key ruling #5),
   `settings.py` (pydantic-settings),
   problem+json error handlers, and a thin `routers/` pattern. Phase 6 **finalizes** the
   protected `routers/me.py` and confirms the `auth.py` wiring against a real local token.
   ⚠️ OPEN / TO CONFIRM — exactly how complete `auth.py`/`me.py` were left at the end of
   Phase 3 (the Phase 3 guide does not yet exist under `docs/`). This guide writes the
   **authoritative** versions; if Phase 3 already shipped them, reconcile rather than
   duplicate.
3. **Phase 4 done** — typegen pipeline works; `features/home` renders `/v1/items` via the
   generated TanStack hook, and the API client wrapper (`core/api.ts`) sets `baseUrl` from
   `EXPO_PUBLIC_API_URL` at startup. This phase makes that wrapper attach the **bearer token**.
4. **Supabase CLI installed** — `supabase --version` works (installed via the documented
   onboarding path; `pnpm bootstrap` runs `supabase start`). Docker is running (the local
   stack is containers).
5. **`supabase-js` not yet a dependency** — this phase adds `@supabase/supabase-js` (pinned
   exact) to `packages/core`, plus `@react-native-async-storage/async-storage` for the native
   session-persistence adapter (already present if Phase 2 added it for query persistence —
   reuse it).

---

## Definition of done

- [ ] `products/_template/supabase/config.toml` exists with `project_id = "example-template"`,
      **auth enabled**, and **all ports offset from `portIndex` (base 54321)**.
- [ ] `supabase start` brings the stack up cleanly; `supabase status` prints the API URL,
      anon key, and JWT secret for the local stack.
- [ ] `@platform/core` exports, from `src/index.ts`: `supabase` client factory (`supabase.ts`),
      the session store + guards (`auth.ts`), and the upload helper (`storage.ts`).
- [ ] `core/supabase.ts` creates the client from `EXPO_PUBLIC_SUPABASE_URL` +
      `EXPO_PUBLIC_SUPABASE_ANON_KEY` with a **platform-correct storage adapter**
      (AsyncStorage native / `localStorage` web) and `autoRefreshToken`/`persistSession` on.
- [ ] `core/auth.ts` exposes a **Zustand** session store wired to `onAuthStateChange`,
      `signIn`/`signUp`/`signOut`, a `useSession()` hook (with `loading` state), and the
      route-guard hooks (`useProtectedRoute` / `useRequireAuth`) used by the route groups.
- [ ] `core/storage.ts` exposes a **direct-to-Storage** upload helper (`uploadAvatar`) using
      `supabase.storage.from(...).upload(...)` and returning a public **or** signed URL.
- [ ] `app/features/auth/` has **`login.tsx` + `signup.tsx`** built on `@platform/ui`
      components + the core plumbing (product-local, per Key ruling #9).
- [ ] Thin route files exist: `app/(auth)/_layout.tsx`, `app/(auth)/login.tsx`,
      `app/(auth)/signup.tsx` (one-liners re-exporting feature screens) and
      `app/(tabs)/_layout.tsx` carries the **guard** (redirect when signed out).
- [ ] `app/_layout.tsx` composes providers: **theme → query(+persist) → auth → error
      boundary**, and renders the `(auth)` / `(tabs)` groups.
- [ ] Settings screen has a working **avatar upload demo** (pick image → `storage.ts` upload →
      render returned URL).
- [ ] `app/.env.development` is **committed** with `EXPO_PUBLIC_SUPABASE_URL`,
      `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL` (local values, publishable only).
- [ ] API: `routers/me.py` is protected by `CurrentUser`; `auth.py` verifies JWKS as the
      **primary** path (ES256/RS256, including against the local stack) with HS256 as a
      fallback; `settings.py` carries the JWKS URL (derived from `supabase_url`) plus the
      optional `SUPABASE_JWT_SECRET` fallback.
- [ ] All **Verify** commands pass (see Verification).
- [ ] `turbo run typecheck test lint --affected` is green for `@platform/core`,
      `@platform/template-app`, and `@platform/template-api`.

---

## Build steps

> Run from repo root unless noted. Paths are repo-relative. Versions shown as
> `PLACEHOLDER-pin-exact` are pinned exact on install (pre-1.0 / tooling-pinning stance).

### 1. Per-product Supabase `config.toml` + ports

**Files:** `products/_template/supabase/config.toml`, `products/_template/supabase/migrations/`
(directory; the Phase 3 initial migration with RLS deny-all already lives here — this phase
adds the **avatars storage bucket + policy** migration in step 9).

**Contents** (`config.toml` — ports for `portIndex 0`; the generator offsets every `port` by
`+100·portIndex`, Key ruling #7 / generator step 4):

```toml
# products/_template/supabase/config.toml
# Local-only Supabase stack for the `template` product.
# project_id derives from the PRODUCT name (example-<product>), NOT the monorepo name.
project_id = "example-template"

[api]
enabled = true
port = 54321
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = 54322
shadow_port = 54320
major_version = 17

[db.pooler]
enabled = false          # the API uses the hosted pooler (6543) per env; local uses 5432 direct
port = 54329

[studio]
enabled = true
port = 54323

[inbucket]               # local email testing (signup confirmation links land here)
enabled = true
port = 54324

[storage]
enabled = true
file_size_limit = "50MiB"

[auth]
enabled = true
site_url = "http://localhost:8081"
additional_redirect_urls = ["http://localhost:8081", "exp://localhost:8081", "app://-/"]
jwt_expiry = 3600
enable_refresh_token_rotation = true
refresh_token_reuse_interval = 10
# JWT signing: the current CLI (≥ v2.71.1) defaults the LOCAL stack to asymmetric ES256,
# matching new hosted projects — so the JWKS path is the primary verifier locally too
# (point the API's SUPABASE_URL at http://localhost:54321). Do NOT assume HS256 locally.
# If you deliberately want HS256 locally (e.g. simpler tests, no JWKS round-trip), pin it
# explicitly via the signing-keys mechanism and document the CLI-version dependency:
#   supabase gen signing-key --algorithm HS256   # (or ES256 to stay on the default)
#   signing_keys_path = "./supabase/signing_key.json"
# A dedicated `jwt_algorithm` toggle was still only a feature request as of Jan 2026
# (supabase/cli#4726), so signing-keys is the supported way to force the local algorithm.

[auth.email]
enable_signup = true
enable_confirmations = false   # local DX: no email round-trip needed to test signup→login
# In staging/production these are managed in the hosted Supabase dashboard, not here.

[analytics]
enabled = false

[realtime]
enabled = true             # broadcast-only pattern lands in Phase 8; bucket enabled now is fine
```

**Commands:**

```bash
supabase --version                                   # CLI present
supabase start --workdir products/_template          # boots the local stack (Docker)
supabase status --workdir products/_template         # prints API URL, anon key, JWT secret
```

**Why:** Each product gets a **fully segregated** local data plane on **offset ports** so
multiple products' stacks coexist (`pnpm bootstrap` runs them together — Phase 7). `project_id`
is keyed to the **product** (`example-template`), never the monorepo name, keeping the scaffold
portable. `enable_confirmations = false` is a **local-only** convenience so signup → login is
testable without the Inbucket email step; the hosted projects enforce confirmation. The
current CLI (≥ v2.71.1) signs **local** tokens with **asymmetric ES256** by default — the same
as new hosted projects — so the API verifies them through **JWKS** locally too (point
`SUPABASE_URL` at `http://localhost:54321`; Key ruling #5). The JWT secret printed by
`supabase status` is only consumed if you fall back to the HS256 path (older CLI / self-hosted
symmetric secret / manually-minted test tokens), which is **not** the local happy path on a
current CLI.

> **Resolved (was OPEN — `config.toml` key set + local JWT algorithm).** The table structure
> above matches the current CLI config reference; the canonical procedure is to run
> `supabase init` once to materialize the installed version's default `config.toml`, then apply
> the offsets + `project_id`. Because the current CLI defaults the local stack to **ES256**, do
> **not** assume HS256: either accept ES256 and let the JWKS branch verify locally (the default
> here), or pin HS256 deliberately via the signing-keys mechanism shown in the `[auth]` block
> above. Confirm `major_version = 17` matches the Postgres bundled with the pinned CLI version.

---

### 2. `@platform/core` deps + `supabase.ts` client factory

**Files:** `packages/core/package.json` (add deps), `packages/core/src/supabase.ts`.

**Contents** (`package.json` — add to `dependencies`):

```jsonc
{
  // ...
  "dependencies": {
    "@supabase/supabase-js": "PLACEHOLDER-pin-exact",
    "@react-native-async-storage/async-storage": "PLACEHOLDER-pin-exact",
    "zustand": "PLACEHOLDER-pin-exact",
    // ...existing: tanstack query, persist client, env, etc.
  },
}
```

**Contents** (`packages/core/src/supabase.ts`):

```ts
// packages/core/src/supabase.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { env } from "./env";

/**
 * Platform-correct auth-session storage adapter.
 * - native (iOS/Android): AsyncStorage
 * - web: window.localStorage (createClient defaults to this when storage is undefined,
 *   but we pass it explicitly so SSR/Electron `app://` contexts are deterministic)
 *
 * NOTE: supabase-js is used on the frontend ONLY for auth / Realtime / Storage.
 * Core domain data still flows through FastAPI (Topology decision).
 */
const authStorage =
  Platform.OS === "web"
    ? typeof window !== "undefined"
      ? window.localStorage
      : undefined
    : AsyncStorage;

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      storage: authStorage as never,
      autoRefreshToken: true,
      persistSession: true,
      // Native deep links don't carry the URL fragment session; only web should parse it.
      detectSessionInUrl: Platform.OS === "web",
      flowType: "pkce",
    },
  });
  return _client;
}

/** Convenience singleton for call sites that don't need lazy init. */
export const supabase = getSupabase();
```

**Why:** A single client factory keeps the storage-adapter branch in **one place** so every
target (native, web, Electron `app://`) persists + refreshes sessions identically. `flowType:
"pkce"` is the modern Supabase auth flow; `detectSessionInUrl` is web-only because native has
no URL fragment to parse. The anon key is **publishable** (`EXPO_PUBLIC_*`) — it is safe in the
committed env file because RLS (deny-all by default, Key ruling on DB conventions) gates data.

---

### 3. `@platform/core` env additions

**Files:** `packages/core/src/env.ts` (extend the existing module).

**Contents:**

```ts
// packages/core/src/env.ts  (additions — the module already exists from Phase 2)
//
// Publishable-only config. Read from EXPO_PUBLIC_* so it is inlined at build time
// for every target. NEVER put secrets here — secrets live in native stores.
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  API_URL: required("EXPO_PUBLIC_API_URL", process.env.EXPO_PUBLIC_API_URL),
  SUPABASE_URL: required("EXPO_PUBLIC_SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL),
  SUPABASE_ANON_KEY: required(
    "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ),
} as const;
```

**Why:** Centralizes the publishable config + fails fast with a clear message if an
`.env.<profile>` file is missing a var. Keeps `supabase.ts` and `api.ts` free of raw
`process.env` reads.

---

### 4. `@platform/core` auth session store + guards (`auth.ts`)

**Files:** `packages/core/src/auth.ts`.

**Contents:**

```ts
// packages/core/src/auth.ts
import { useEffect } from "react";
import { create } from "zustand";
import { useRouter, useSegments } from "expo-router";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

type SessionState = {
  session: Session | null;
  user: User | null;
  /** true until the initial getSession()/onAuthStateChange has resolved — guards MUST wait on this */
  loading: boolean;
  setSession: (s: Session | null) => void;
};

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  user: null,
  loading: true,
  setSession: (session) => set({ session, user: session?.user ?? null, loading: false }),
}));

/**
 * Wire supabase auth → the store ONCE, at the provider root.
 * Returns nothing; mount <AuthProvider/> (below) high in app/_layout.tsx.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setSession = useSessionStore((s) => s.setSession);
  useEffect(() => {
    const supabase = getSupabase();
    // 1) hydrate current session (covers cold start with a persisted session)
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    // 2) keep the store in sync (SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => sub.subscription.unsubscribe();
  }, [setSession]);
  return <>{children}</>;
}

/** Read-only session accessor for screens. */
export function useSession() {
  return useSessionStore((s) => ({ session: s.session, user: s.user, loading: s.loading }));
}

export function getAccessToken(): string | null {
  return useSessionStore.getState().session?.access_token ?? null;
}

// ---- auth actions (thin wrappers; screens call these) -------------------------------

export async function signIn(email: string, password: string) {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(email: string, password: string) {
  const { error } = await getSupabase().auth.signUp({ email, password });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
}

// ---- route guard ---------------------------------------------------------------------

/**
 * Shared guard hook used by the route-group layouts. Redirects:
 *  - signed OUT + inside (tabs)  → (auth)/login
 *  - signed IN  + inside (auth)  → (tabs)
 * Waits on `loading` so a persisted session does not flash the login screen on cold start.
 */
export function useProtectedRoute() {
  const { session, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return; // CRITICAL: avoid redirect flicker before session hydrates
    const inAuthGroup = segments[0] === "(auth)";
    if (!session && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (session && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [session, loading, segments, router]);

  return { loading };
}
```

**Why:** Plumbing lives in `@platform/core` (Key ruling #9 — **only** plumbing is shared; the
**screens** stay product-local). The store is the **single source of truth** for the session,
fed by `onAuthStateChange` so token refreshes and external sign-outs propagate. `loading`
gates the guard so a persisted session doesn't cause a **login-screen flash** on cold start
(see Gotchas). `getAccessToken()` is a non-hook accessor so the API client wrapper can read the
bearer token outside React.

---

### 5. API client wrapper attaches the bearer token

**Files:** `packages/core/src/api.ts` (extend the existing wrapper from Phase 4).

**Contents** (the auth-relevant addition):

```ts
// packages/core/src/api.ts  (excerpt — wrapper already sets baseUrl + X-Request-Id in Phase 4)
import { getAccessToken } from "./auth";

// hey-api client-fetch interceptor: attach the Supabase JWT as a bearer token.
client.interceptors.request.use((request) => {
  const token = getAccessToken();
  if (token) request.headers.set("Authorization", `Bearer ${token}`);
  return request;
});
```

**Why:** Core domain data goes through FastAPI, which **verifies** the Supabase JWT. The
frontend therefore must forward the access token on every API request; reading it from the
store via `getAccessToken()` (not a hook) keeps the interceptor synchronous. `X-Request-Id`
(Phase 4/8) and the bearer header are both injected here, in one place.

---

### 6. `@platform/core` storage upload helper (`storage.ts`)

**Files:** `packages/core/src/storage.ts`.

**Contents:**

```ts
// packages/core/src/storage.ts
import { getSupabase } from "./supabase";

const AVATAR_BUCKET = "avatars";

export type UploadResult = { path: string; url: string };

/**
 * Direct-to-Storage upload (supabase-js, frontend-only path per Topology decision).
 * Stores under `<userId>/avatar.<ext>` so the per-user RLS policy (step 9) applies.
 * Returns a public URL (avatars bucket is public) — swap to a signed URL for private buckets.
 */
export async function uploadAvatar(
  userId: string,
  file: { uri: string; mimeType?: string; name?: string },
): Promise<UploadResult> {
  const supabase = getSupabase();
  const ext = (file.name?.split(".").pop() ?? "jpg").toLowerCase();
  const path = `${userId}/avatar.${ext}`;

  // RN/web: fetch the local file URI into a Blob/ArrayBuffer for upload.
  const res = await fetch(file.uri);
  const blob = await res.blob();

  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, {
    contentType: file.mimeType ?? `image/${ext === "jpg" ? "jpeg" : ext}`,
    upsert: true, // re-uploading replaces the user's avatar in place
  });
  if (error) throw error;

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  // cache-bust so the <Image> re-fetches after an upsert overwrites the same path
  return { path, url: `${data.publicUrl}?t=${Date.now()}` };
}

/** For a private bucket variant: time-limited signed URL instead of public. */
export async function signedAvatarUrl(path: string, expiresInSec = 3600): Promise<string> {
  const { data, error } = await getSupabase()
    .storage.from(AVATAR_BUCKET)
    .createSignedUrl(path, expiresInSec);
  if (error) throw error;
  return data.signedUrl;
}
```

**Why:** Storage uploads are an **explicitly allowed** frontend-direct path (Topology +
Cross-cutting Storage/CDN). Uploading to `<userId>/...` is what lets the RLS policy scope writes
per user (step 9). `upsert: true` + cache-busting query gives a clean "replace my avatar" UX.
The method names + return shapes (`.upload(path, body, {contentType, upsert})`,
`getPublicUrl(path) → {data:{publicUrl}}`, `createSignedUrl(path, secs) → {data:{signedUrl}}`)
match supabase-js v2 current.

> ⚠️ REVIEW: on **React Native**, fetching a `file://` URI to a `Blob` has historically been
> flaky; the more robust RN path is an `ArrayBuffer` (e.g. `expo-file-system` read or
> `fetch(...).then(r => r.arrayBuffer())`) passed to `.upload(...)`. The `fetch → blob` form
> above is fine on web and recent RN, but switch to `ArrayBuffer` if uploads misbehave on a
> device.

---

### 7. Product-local auth screens (`app/features/auth/`)

**Files:** `products/_template/app/features/auth/login.tsx`,
`products/_template/app/features/auth/signup.tsx`.

**Contents** (`features/auth/login.tsx` — signup is the same shape calling `signUp`):

```tsx
// products/_template/app/features/auth/login.tsx
import { useState } from "react";
import { View } from "react-native";
import { Link, useRouter } from "expo-router";
import { signIn } from "@platform/core";
import { Button, Input, Text, Card } from "@platform/ui";

export function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      // the guard (useProtectedRoute) handles the redirect once the session lands;
      // an explicit replace is a harmless belt-and-braces.
      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="bg-background flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm gap-4 p-6">
        <Text className="text-foreground text-2xl font-semibold">Sign in</Text>
        <Input
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <Input placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
        {error ? <Text className="text-destructive">{error}</Text> : null}
        <Button onPress={onSubmit} disabled={busy}>
          <Text>{busy ? "Signing in…" : "Sign in"}</Text>
        </Button>
        <Link href="/(auth)/signup" className="text-primary text-center">
          No account? Sign up
        </Link>
      </Card>
    </View>
  );
}
```

**Commands:**

```bash
# image-picker dep is needed by the settings avatar demo (step 10) but is an app dep:
pnpm --filter @platform/template-app add expo-image-picker
```

**Why:** Per **Key ruling #9 (rich-starter inheritance)**, every stamped product **copies** a
working, restylable auth UI rather than importing a shared screens package — so screens are
**product-local**. They are built **only** on `@platform/ui` components (semantic-token classes,
no hex) + the core plumbing (`signIn`/`signUp`), keeping them brandable and decoupled.

---

### 8. Thin route files: `(auth)` + `(tabs)` guard + `_layout.tsx` providers

**Files:**

- `products/_template/app/app/(auth)/_layout.tsx`
- `products/_template/app/app/(auth)/login.tsx`
- `products/_template/app/app/(auth)/signup.tsx`
- `products/_template/app/app/(tabs)/_layout.tsx`
- `products/_template/app/app/_layout.tsx`

**Contents** (`app/(auth)/login.tsx` — thin one-liner; `signup.tsx` mirrors it):

```tsx
// products/_template/app/app/(auth)/login.tsx
export { LoginScreen as default } from "../../features/auth/login";
```

```tsx
// products/_template/app/app/(auth)/_layout.tsx
import { Stack } from "expo-router";
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

**Contents** (`app/(tabs)/_layout.tsx` — carries the guard):

```tsx
// products/_template/app/app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { useProtectedRoute } from "@platform/core";
import { Text } from "@platform/ui";

export default function TabsLayout() {
  const { loading } = useProtectedRoute(); // redirects to (auth)/login when signed out
  if (loading) {
    // hold the splash/loader while the persisted session hydrates — no flicker
    return <Text className="text-muted-foreground m-auto">Loading…</Text>;
  }
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
```

**Contents** (`app/_layout.tsx` — provider composition + error boundary):

```tsx
// products/_template/app/app/_layout.tsx
import { Slot } from "expo-router";
import { ThemeProvider } from "@platform/ui"; // theme/CSS-var provider (Phase 2)
import { QueryProvider, AuthProvider } from "@platform/core"; // query+persist (P4) + auth (P6)
import { ErrorBoundary } from "../features/_shared/error-boundary"; // product-local error UX

import "../global.css";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <QueryProvider>
        <AuthProvider>
          <ErrorBoundary>
            {/* Slot renders the active group: (auth) or (tabs). useProtectedRoute,
                mounted in each group layout, decides which one is reachable. */}
            <Slot />
          </ErrorBoundary>
        </AuthProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
```

**Why:** Route files stay **thin one-liners** (Code-sharing decision) — all logic is in
`features/`. The guard lives in the **`(tabs)` group layout** so the whole authenticated area
is protected by one hook; the `loading` branch holds the UI while the session hydrates,
preventing the cold-start login flash. Provider **order matters**: theme outermost (everything
themes), then query (data layer), then auth (session feeds guards + API token), then the error
boundary wrapping the rendered tree.

> ⚠️ OPEN / TO CONFIRM — exact `ThemeProvider` / `QueryProvider` export names + the
> `features/_shared/error-boundary` location come from Phase 2's app shell; reconcile against
> what Phase 2 actually exported.

---

### 9. Storage bucket + RLS policy migration

**Files:** `products/_template/supabase/migrations/<timestamp>_avatars_bucket.sql`.

**Contents:**

```sql
-- products/_template/supabase/migrations/<timestamp>_avatars_bucket.sql
-- Avatars bucket for the direct-to-Storage upload demo.
-- Public read; users may write ONLY under their own <auth.uid()>/ prefix.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- read: anyone can read public avatars
create policy "avatars_public_read"
  on storage.objects for select
  using ( bucket_id = 'avatars' );

-- write/update/delete: only the owning user (path is "<uid>/...")
create policy "avatars_owner_write"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

**Commands:**

```bash
supabase db reset --workdir products/_template   # re-applies ALL migrations incl. this one (local)
# or, against a running stack without a full reset:
supabase migration up --workdir products/_template
```

**Why:** Tables are **RLS deny-all by default** (DB conventions ruling), and Storage objects
are no exception — the bucket needs explicit policies. Scoping writes to the `<uid>/` prefix
(matching the `uploadAvatar` path in step 6) means a user can only overwrite **their own**
avatar, while keeping reads public so any client can render it. Schema/storage changes go
**only** through Alembic for app tables — but Supabase **Storage** buckets/policies live in the
Supabase **migrations** dir (the storage schema is Supabase-managed, not the app's SQLModel
tables).

> **Resolved (was OPEN — public vs private avatars bucket) → public** for the template demo.
> A public bucket with `getPublicUrl` (synchronous, no network round-trip) is the simplest
> correct choice and the common Supabase avatar pattern; per-user write safety comes from the
> `(<uid>/...)` prefix policy on `storage.objects`, **not** from bucket privacy. The
> `signedAvatarUrl` helper (step 6) is retained for products that flip the bucket to private —
> they switch the render path to `createSignedUrl` (async, expiring).

---

### 10. Settings avatar upload demo

**Files:** `products/_template/app/features/settings/avatar-uploader.tsx`, and wire it into the
existing `features/settings/` screen (theme toggle already lives there from Phase 2).

**Contents:**

```tsx
// products/_template/app/features/settings/avatar-uploader.tsx
import { useState } from "react";
import { Image, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { uploadAvatar, useSession } from "@platform/core";
import { Button, Text } from "@platform/ui";

export function AvatarUploader() {
  const { user } = useSession();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPick() {
    if (!user) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setBusy(true);
    setError(null);
    try {
      const { url } = await uploadAvatar(user.id, {
        uri: asset.uri,
        mimeType: asset.mimeType,
        name: asset.fileName ?? "avatar.jpg",
      });
      setUrl(url); // render it back from Storage
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="gap-3">
      <Text className="text-foreground text-lg font-medium">Avatar</Text>
      {url ? (
        <Image source={{ uri: url }} className="h-24 w-24 rounded-full" />
      ) : (
        <View className="bg-muted h-24 w-24 rounded-full" />
      )}
      {error ? <Text className="text-destructive">{error}</Text> : null}
      <Button onPress={onPick} disabled={busy}>
        <Text>{busy ? "Uploading…" : "Upload avatar"}</Text>
      </Button>
    </View>
  );
}
```

**Why:** This is the **direct-to-Storage** demo: pick an image → `storage.ts` uploads it via
`supabase-js` (frontend-only path) → the public URL renders straight back, proving the round
trip. `user.id` from the session scopes the upload to the RLS-allowed prefix.

---

### 11. Committed `.env.development`

**Files:** `products/_template/app/.env.development` (committed; `.env`/`.env.local` stay
gitignored).

**Contents** (local-stack values — fill anon key from `supabase status`):

```bash
# products/_template/app/.env.development  (COMMITTED — publishable only, NO secrets)
EXPO_PUBLIC_API_URL=http://localhost:8000/v1
EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key-from-`supabase status`>
```

**Why:** Per the **Env/config** decision, frontend config is **publishable-only**
(`EXPO_PUBLIC_*`) in **committed per-env files**; EAS/Vercel select the profile. The anon key
is **publishable by design** (RLS gates data), so committing it is correct. The generator
rewrites these ports per `portIndex` for stamped products (generator step 4). `.env.staging` /
`.env.production` (also committed) carry the hosted Supabase URLs/keys — out of scope here.

---

### 12. API — finalize protected `/v1/me`, `auth.py`, `settings.py`

**Files:** `products/_template/api/src/template_api/auth.py`,
`products/_template/api/src/template_api/settings.py`,
`products/_template/api/src/template_api/routers/me.py`,
`products/_template/api/src/template_api/schemas/me.py`.

**Contents** (`settings.py` — auth-relevant fields; the module exists from Phase 3):

```python
# products/_template/api/src/template_api/settings.py  (auth fields)
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Base of the Supabase project. Hosted per-env; local = http://localhost:54321.
    # Point this at the LOCAL stack in dev so PyJWKClient resolves the local JWKS — the
    # current CLI issues ES256 locally, so JWKS is the primary verifier on every env.
    supabase_url: str
    # JWKS endpoint for asymmetric (ES256/RS256) verification — the PRIMARY path on ALL
    # environments (hosted and current-CLI-local). Derived from supabase_url; kept explicit
    # so it can be overridden per env.
    supabase_jwks_url: str | None = None
    # HS256 FALLBACK secret only — used for older CLI versions, self-hosted symmetric
    # secrets, or manually-minted test tokens. NOT required on a current CLI (which signs
    # local tokens with ES256, verified via JWKS above).
    supabase_jwt_secret: str | None = None
    supabase_jwt_aud: str = "authenticated"

    @property
    def jwks_url(self) -> str:
        return self.supabase_jwks_url or f"{self.supabase_url}/auth/v1/.well-known/jwks.json"


settings = Settings()  # type: ignore[call-arg]
```

**Contents** (`auth.py` — JWKS + HS256 fallback, `CurrentUser`):

```python
# products/_template/api/src/template_api/auth.py
from typing import Annotated, Any
from uuid import UUID

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from .errors import problem  # RFC 9457 helper from Phase 3
from .settings import settings

_bearer = HTTPBearer(auto_error=False)
# PyJWKClient caches signing keys internally (lifecycle = process); ES256/RS256 path.
_jwks_client = PyJWKClient(settings.jwks_url)

# ES256 (P-256) is the new-project AND current-CLI-local default; RS256 is the other
# common asymmetric option, so accept both. (EdDSA/Ed25519 is also selectable — add
# "EdDSA" here only if a product opts into Ed25519 signing keys.)
_ASYM_ALGS = ["ES256", "RS256"]


class AuthUser:
    def __init__(self, claims: dict[str, Any]) -> None:
        self.claims = claims
        self.id = UUID(claims["sub"])
        self.email: str | None = claims.get("email")


def _decode(token: str) -> dict[str, Any]:
    # 1) PRIMARY: asymmetric verification via JWKS. This is the happy path on ALL
    #    environments — new hosted projects AND the current local CLI (>= v2.71.1) both
    #    default to ES256, so point settings.supabase_url at http://localhost:54321 locally
    #    and PyJWKClient hits the local /auth/v1/.well-known/jwks.json.
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token).key
        return jwt.decode(
            token,
            signing_key,
            algorithms=_ASYM_ALGS,
            audience=settings.supabase_jwt_aud,
        )
    except (jwt.PyJWKClientError, jwt.InvalidAlgorithmError, jwt.DecodeError):
        pass  # fall through to HS256

    # 2) FALLBACK: HS256 symmetric verification — only for older CLI versions, self-hosted
    #    symmetric secrets, or manually-minted test tokens (Key ruling #5). NOT reached on a
    #    current CLI, whose local tokens are ES256 and verify via the JWKS branch above.
    #    (Operationally this branch is reachable only when the JWKS endpoint yields no usable
    #    key for the token — e.g. a project still on legacy HS256 symmetric signing returns no
    #    asymmetric keys — so the asym attempt above raises and we fall through here.)
    if not settings.supabase_jwt_secret:
        raise _unauthorized("token verification unavailable")
    try:
        return jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience=settings.supabase_jwt_aud,
        )
    except jwt.PyJWTError as exc:  # signature/exp/aud failures → 401
        raise _unauthorized("invalid token") from exc


def _unauthorized(detail: str):
    # problem+json 401 (RFC 9457), consistent with the rest of the API.
    return problem(status=401, title="Unauthorized", detail=detail)


async def get_current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> AuthUser:
    if creds is None or not creds.credentials:
        raise _unauthorized("missing bearer token")
    return AuthUser(_decode(creds.credentials))


CurrentUser = Annotated[AuthUser, Depends(get_current_user)]
```

**Contents** (`routers/me.py` — thin, protected):

```python
# products/_template/api/src/template_api/routers/me.py
from fastapi import APIRouter

from ..auth import CurrentUser
from ..schemas.me import MeOut

router = APIRouter(prefix="/v1", tags=["me"])


@router.get("/me", response_model=MeOut)
async def read_me(user: CurrentUser) -> MeOut:
    # No service/DB needed: identity comes straight from the verified JWT claims.
    return MeOut(id=user.id, email=user.email)
```

```python
# products/_template/api/src/template_api/schemas/me.py
from uuid import UUID

from pydantic import BaseModel


class MeOut(BaseModel):
    id: UUID
    email: str | None = None
```

**Commands** (api `.env` — server-side, NOT committed; templated by `.env.example`):

```bash
# products/_template/api/.env  (local; from `supabase status`)
# SUPABASE_URL points at the LOCAL stack so PyJWKClient verifies the CLI's ES256 tokens
# via the local JWKS — this is the local happy path on a current CLI.
SUPABASE_URL=http://localhost:54321
# SUPABASE_JWT_SECRET is the OPTIONAL HS256 fallback only — leave unset on a current CLI
# (local tokens are ES256). Set it only when targeting an older CLI / self-hosted symmetric
# secret / minted HS256 test tokens.
# SUPABASE_JWT_SECRET=<JWT secret from `supabase status`>
```

**Why:** Implements **Key ruling #5** verbatim: **JWKS (ES256/RS256, cached) is the primary
verifier on every environment** — new hosted projects AND the current local CLI (≥ v2.71.1)
both default to ES256, so pointing `supabase_url` at `http://localhost:54321` lets
`PyJWKClient` verify local tokens through the local JWKS. HS256 + `SUPABASE_JWT_SECRET` is a
genuine **fallback only** (older CLI, self-hosted symmetric secret, manually-minted test
tokens) — a backend that trusts only HS256 locally will **401 every request** on a current CLI
(supabase/cli#4726). `audience="authenticated"` is enforced (Gotchas). `CurrentUser` is the
thin dependency Phase 3 promised; `routers/me.py` stays a one-liner reading verified claims —
no DB round-trip, no ORM leakage (DTO `MeOut` only). Mount the router in `main.py` if Phase 3
didn't.

> ⚠️ OPEN / TO CONFIRM — Phase 3's exact `problem()` signature/`errors.py` API and whether the
> `me` router was already mounted. The above assumes the Phase 3 problem+json helper; reconcile.

---

## Gotchas & pitfalls

- **JWKS is the primary path locally too — a HS256-only backend 401s every local request.**
  The current Supabase CLI (≥ v2.71.1) signs **local** tokens with **asymmetric ES256** by
  default, the same as new hosted projects — the old "local CLI issues HS256" premise is
  **false** on a current CLI (supabase/cli#4726). So point the api's `SUPABASE_URL` at
  `http://localhost:54321` and let `PyJWKClient` verify local tokens through the local
  `/auth/v1/.well-known/jwks.json`. A backend configured to trust **only** HS256 locally will
  **401 every authenticated `/v1/me` call** even with a valid session. HS256 +
  `SUPABASE_JWT_SECRET` is a **fallback only** (older CLI, self-hosted symmetric secret,
  manually-minted test tokens); if you genuinely want HS256 locally, pin it explicitly in
  `config.toml` via the signing-keys mechanism (§1) and document the CLI-version dependency.
- **`audience="authenticated"` is required.** Supabase access tokens carry `aud:
"authenticated"`. If `jwt.decode` omits `audience`, PyJWT raises `InvalidAudienceError` → 401. Set `supabase_jwt_aud = "authenticated"` (default above).
- **supabase-js is ONLY for auth / Realtime / Storage.** Do **not** query app tables (items,
  push tokens, etc.) from the client — those flow through FastAPI, which holds the privileged
  role and bypasses RLS. The frontend client is RLS-gated by design; tables are deny-all.
- **Guards MUST handle the loading state.** On cold start with a persisted session,
  `getSession()` is async; if the guard redirects before `loading` clears, the user sees a
  **login-screen flash** then a bounce to tabs. The `useProtectedRoute` `if (loading) return`
  and the `(tabs)` layout's loading branch both exist for this.
- **Storage bucket + RLS policy must be set up explicitly.** The `avatars` bucket and its
  per-`<uid>/` write policy (step 9) are required — RLS is deny-all, so without policies the
  upload returns a **403/RLS error**. Upload path **must** start with `auth.uid()` to satisfy
  the policy.
- **Offset ports per product.** Every product's Supabase stack uses `54321 + 100·portIndex`
  (and API `8000 + 10·portIndex`). Forgetting the offset means two products' stacks **collide**
  on the same Docker ports when run together (`pnpm bootstrap`).
- **The anon key is publishable.** Committing `EXPO_PUBLIC_SUPABASE_ANON_KEY` in
  `.env.development` is correct and intended — it is the publishable key; RLS gates data. The
  **JWT secret** / service-role key are **secrets** (api `.env`, native stores) and must NEVER
  be `EXPO_PUBLIC_*` or committed.
- **`detectSessionInUrl` is web-only.** Leaving it on for native can throw on deep-link parse;
  the factory branches on `Platform.OS`.
- **Cache-bust the avatar URL after `upsert`.** Re-uploading to the same `<uid>/avatar.<ext>`
  path returns the **same** public URL; without the `?t=` query the `<Image>` shows the stale
  cached image (handled in `uploadAvatar`).
- **Electron `app://` redirect URL.** `app://-/` is included in
  `auth.additional_redirect_urls` so desktop auth redirects resolve; confirm once desktop auth
  is exercised.

---

## Verification

Run from repo root. Two terminals: one for the api (`turbo run dev --filter=*template-api`),
one for the app (`turbo run dev --filter=*template-app`). Supabase up first.

### V1 — `supabase start`

```bash
supabase start --workdir products/_template
supabase status --workdir products/_template
```

**Expected:** Stack boots; `status` prints `API URL: http://localhost:54321`, an **anon key**,
and a **JWT secret**. Paste the anon key into `app/.env.development` and the JWT secret into the
api `.env`. Studio reachable at `http://localhost:54323`.

### V2 — sign up through the template's login screen

```bash
turbo run dev --filter=*template-app   # web at http://localhost:8081
```

Open `localhost:8081` → you land on **`(auth)/login`** (no session) → tap "Sign up" → submit a
new email + password.
**Expected:** A real user is created in the local Supabase (visible in Studio → Authentication).
With `enable_confirmations = false`, the session lands immediately and the guard **redirects to
`(tabs)`**.

### V3 — guarded tabs redirect when signed out

From the settings screen, **sign out** (calls `signOut()`).
**Expected:** `onAuthStateChange` fires `SIGNED_OUT` → store clears → `useProtectedRoute`
redirects to **`(auth)/login`**. Reloading the page while signed out keeps you on login (no
tabs flash). Reloading while signed **in** lands on tabs with **no login flash** (loading state
handled).

### V4 — bearer-token curl → user id

Grab a valid token from the running web app (devtools → `localStorage` Supabase session, or log
`getAccessToken()`), then:

```bash
TOKEN="<access_token from a signed-in session>"
curl -s http://localhost:8000/v1/me -H "Authorization: Bearer $TOKEN" | jq
```

**Expected:** `200` with `{"id":"<uuid>","email":"<the signup email>"}` — the `id` matches the
user's Supabase `sub`.

### V5 — bad token → 401

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/v1/me \
  -H "Authorization: Bearer not-a-real-token"
curl -s http://localhost:8000/v1/me -H "Authorization: Bearer not-a-real-token" \
  -H "Accept: application/json" | jq
```

**Expected:** HTTP **401**; body is **RFC 9457 problem+json**
(`{"type":...,"title":"Unauthorized","status":401,"detail":"invalid token"}`). Missing header
also 401 (`"missing bearer token"`).

### V6 — avatar uploads and renders back from Storage

On the settings screen (signed in), tap **Upload avatar**, pick an image.
**Expected:** The image uploads (Studio → Storage → `avatars/<uid>/avatar.*` appears) and the
**same image renders back** in the avatar circle from its public URL. Re-uploading replaces it
in place and the new image shows (cache-bust working). A signed-out attempt is impossible
(screen is behind the guard); a write to another user's prefix would be rejected by RLS.

### V7 — affected gate green

```bash
turbo run typecheck test lint --affected
```

**Expected:** Green for `@platform/core`, `@platform/template-app`, `@platform/template-api`.
API tests include `test_auth.py` (JWT paths: a minted HS256 token exercising the fallback
branch, bad token → 401, missing aud → 401) and a `/v1/me` router round-trip over the real
local Postgres (per the testing strategy). Note: the HS256 tests mint tokens directly so they
pass on their own merits, but they **no longer represent what the live local stack emits** —
the running CLI issues ES256, verified via the JWKS branch. Add an ES256/JWKS-path test if you
want coverage matching the live local token (e.g. against the local JWKS or a mocked JWK set).

---

## Commits

Phase 6 is one feature branch, logically:

1. **`feat(supabase): per-product local config.toml + avatars bucket migration`** —
   `products/_template/supabase/config.toml` (auth/storage on, offset ports,
   `project_id example-template`) + the `avatars` bucket + RLS policy migration; verify
   `supabase start` / `db reset`.
2. **`feat(core): supabase client factory, auth session store + guards, storage helper`** —
   `packages/core/src/{supabase,auth,storage}.ts`, `env.ts` additions, `api.ts` bearer
   interceptor, export from `index.ts`; add `@supabase/supabase-js` + async-storage + zustand
   pinned exact; `pnpm install`.
3. **`feat(template-app): auth screens + route guards + provider tree`** —
   `features/auth/{login,signup}.tsx`, thin `app/(auth)/*` + `app/(tabs)/_layout.tsx` guard,
   `app/_layout.tsx` provider composition + error boundary; commit `.env.development`.
4. **`feat(template-app): settings avatar upload demo`** —
   `features/settings/avatar-uploader.tsx` + wire into the settings screen; add
   `expo-image-picker`.
5. **`feat(template-api): protect /v1/me with CurrentUser; finalize auth.py JWKS+HS256`** —
   `auth.py`, `settings.py` auth fields, `routers/me.py` + `schemas/me.py`, mount in `main.py`;
   `tests/test_auth.py`.

Each commit should leave `turbo run typecheck --affected` green. Do **not** add the realtime
broadcast pattern, push loop, or CI workflows here — those are Phase 8.

---

## Open questions / deferred

- ⚠️ OPEN / TO CONFIRM — **exact pinned versions** of `@supabase/supabase-js`,
  `@react-native-async-storage/async-storage`, `zustand`, `expo-image-picker`, `pyjwt[crypto]`.
  PHILOSOPHY.md pins no majors; pick current stable, pin exact (`PLACEHOLDER-pin-exact` markers).
- **Resolved — avatars bucket public vs private → public** for the template demo
  (`getPublicUrl`, synchronous, common avatar pattern; per-user write safety from the `<uid>/`
  prefix policy, not bucket privacy). `signedAvatarUrl` is retained for products that flip to a
  private bucket (they switch the settings render path to `createSignedUrl`).
- ⚠️ OPEN / TO CONFIRM — **Phase 3 reconciliation.** The Phase 3 guide (`docs/phase-3-api.md`)
  does not yet exist; this guide writes the authoritative `auth.py` / `settings.py` /
  `routers/me.py`. If Phase 3 already shipped any of these (e.g. `problem()` signature, whether
  `me` is mounted), reconcile rather than duplicate.
- ⚠️ OPEN / TO CONFIRM — **Phase 2 export names** for `ThemeProvider` / `QueryProvider` and the
  product-local `features/_shared/error-boundary` location used by `app/_layout.tsx`.
- **Resolved — canonical `config.toml` key set** (see §1). The table structure shown matches
  the current CLI config reference; the procedure is to run `supabase init` once to materialize
  the pinned version's default `config.toml`, then apply the offsets + `project_id`. Because the
  current CLI defaults the local stack to **ES256**, the `[auth]` signing-key configuration must
  be set deliberately if HS256-local is wanted (no dedicated `jwt_algorithm` toggle exists as of
  Jan 2026 — supabase/cli#4726). Still confirm `major_version` matches the Postgres bundled with
  the installed CLI.
- **Resolved — email confirmation in local DX → `enable_confirmations = false` locally** so
  signup→login is one step (the right default for the template demo). If a product wants to
  exercise the confirmation flow locally, flip it on and use **Inbucket** (port 54324) to read
  the link; hosted staging/production enforce confirmation via the dashboard.
- **Deferred to Phase 8:** Realtime broadcast-and-invalidate (`core/realtime.ts`), the push
  loop (`/v1/push-tokens` + `send_push`), Sentry/structlog observability, the web E2E
  (signup→login→items→realtime) and Maestro mobile-auth flow, and all CI workflows. Phase 6
  ships only local auth + guards + the storage demo + the protected `/v1/me`.
- **Deferred:** staging/production Supabase wiring (`.env.staging`/`.env.production` real
  hosted URLs/keys, JWKS asymmetric path exercised against a hosted project) — proven once the
  infra accounts exist (generator infra checklist, Phase 7).
