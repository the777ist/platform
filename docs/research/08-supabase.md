# Supabase — accuracy review (June 2026)

Scope: the Supabase claims in PHILOSOPHY.md (Topology, rulings #4 and #5, Realtime broadcast-only,
DB conventions) and the three execution guides `docs/phase-3-api.md`, `docs/phase-6-auth.md`,
`docs/phase-8-cicd-obs.md`. Domain: Auth/JWT, connection pooling/Supavisor, supabase-js,
Realtime, Storage, Supabase CLI, RLS. Verified against current docs/issues (June 2026).
WebFetch against `supabase.com` and the DeepWiki mirror returned HTTP 403 throughout this
session, so findings rest on WebSearch result extracts plus the GitHub issue tracker (which
fetched cleanly); each finding cites its source URL.

## Summary

- **Checked:** 18 distinct claims.
- **Issues:** 1 ❌ (incorrect/outdated), 5 ⚠️ (imprecise or needs caveat), 12 ✅, 1 ❓ (open,
  resolved below).
- **Headline:** The architecture is fundamentally sound and well-aligned with current
  Supabase reality — **with one materially outdated claim**: ruling #5's premise that "the
  local CLI stack still issues HS256" is **no longer true** as of Supabase CLI **v2.71.1**
  (the local default flipped to **ES256/asymmetric**). The HS256 fallback the plan builds is
  still valuable, but it is now a *fallback*, not the local happy path, and the local stack
  must be explicitly pinned to HS256 (or the JWKS path tested locally) or every local
  `/v1/me` 401s. Everything else (pooler ports, server-side broadcast) holds up.

Verdict on the three load-bearing claims:

1. **Asymmetric JWT default for new projects — CONFIRMED (✅).** New Supabase projects created
   **after 2025-10-01 default to asymmetric ES256** signing; HS256 is the legacy mode, with
   full transition expected late 2026. Verifying via JWKS (ES256/RS256) is correct.
   Evidence: Supabase JWT Signing Keys feature/blog + docs; "new projects use asymmetric JWTs
   by default" (as of Oct 1 2025).
2. **Pooler 6543 transaction-only, session mode removed, 5432 direct — CONFIRMED (✅).**
   Supavisor deprecated **Session Mode on port 6543 on 2025-02-28**; 6543 is now
   transaction-mode only, session mode lives on 5432, direct connection on 5432. Migrations
   over 5432, runtime over 6543 is correct. Transaction mode does **not** support prepared
   statements — Supabase's own guidance is to disable them (psycopg3 `prepare_threshold=None`)
   and use `NullPool`. Evidence: Supabase changelog/connection docs + SQLAlchemy troubleshooting
   guide.
3. **Server-initiated Realtime broadcast — CONFIRMED (✅).** Supabase Realtime supports sending
   a Broadcast message from a server via an HTTP **POST `/realtime/v1/api/broadcast`** with the
   service_role key, no prior WebSocket needed; SQL `realtime.send` / `realtime.broadcast_changes`
   are the in-DB equivalents. The "broadcast-only, tables stay RLS-locked, clients refetch"
   pattern is exactly a supported topology — broadcast rides `realtime.messages`/channels, not
   Postgres-Changes, so no table RLS needs opening. Evidence: Realtime Broadcast docs +
   Realtime Authorization docs.

## Findings

### 1. Ruling #5 / Phase 3 §9 / Phase 6 §12 — "local CLI stack still issues HS256"
- **Location:** PHILOSOPHY.md ruling #5 (lines 75–77); `docs/phase-3-api.md` Step 9 + Gotchas
  ("the local CLI stack still issues HS256"); `docs/phase-6-auth.md` §1 Why, §12 Why, Gotchas
  ("the local CLI stack signs tokens with HS256").
- **Claim:** New projects sign asymmetrically (JWKS), but the **local** Supabase CLI stack
  **still issues HS256**, so an HS256 + `SUPABASE_JWT_SECRET` fallback is required for local
  dev/tests.
- **Status:** ❌ (outdated — the local-HS256 premise is now false on current CLI).
- **Finding:** Supabase **CLI v2.71.1** shipped `fix: use asymmetric signing key by default`,
  changing the **local** default signing algorithm from HS256 to **ES256** — released as a
  patch with no opt-out at the time. On a current CLI, `supabase start` issues **ES256**
  tokens locally, so a backend that only trusts HS256 locally will 401 every authenticated
  request (this exact symptom is reported in supabase/cli#4726, filed 2026-01-16). The plan's
  reasoning ("HS256 fallback because the local CLI still issues HS256") inverts current
  reality: locally you now get ES256 by default, the same as hosted. The HS256 fallback is
  still worth keeping (older CLI versions, self-hosted with a symmetric secret, manually-minted
  test tokens), but it is no longer the local happy path.
- **Recommended change:** (a) Update ruling #5 / the guides to state that **both** hosted and
  current-CLI-local default to **asymmetric ES256**, verified via JWKS — the JWKS path must
  work locally too (point `SUPABASE_URL`/`supabase_url` at `http://localhost:54321` so
  `PyJWKClient` hits the local `/auth/v1/.well-known/jwks.json`). (b) Keep HS256 as a genuine
  fallback but stop describing it as "local". (c) If HS256 locally is actually desired
  (simpler, no JWKS round-trip in tests), pin it explicitly in `config.toml`
  (`[auth] signing_keys ...` / the `jwt_algorithm`/`signing_keys_path` mechanism — see
  Finding 7) and document the CLI version dependency. Note the `test_auth.py` HS256 tests in
  Phase 3 still pass on their own merits (they mint HS256 tokens directly), but they no longer
  represent what the live local stack emits.
- **Source(s):** supabase/cli#4726; CLI v2.71.1 changelog note; JWT Signing Keys docs.

### 2. Ruling #5 — asymmetric default for new projects
- **Location:** PHILOSOPHY.md ruling #5; Phase 3 Step 9 / Phase 6 §12.
- **Claim:** "new Supabase projects use asymmetric keys → verify via JWKS (PyJWKClient,
  ES256/RS256, cached)".
- **Status:** ✅.
- **Finding:** Correct. Projects created after **2025-10-01** default to asymmetric **ES256**;
  HS256 is legacy. The JWKS endpoint also includes the legacy symmetric key so verifiers can
  accept both during migration. ES256 is the new-project default; RS256 and Ed25519 are also
  selectable signing algorithms, so listing `["ES256","RS256"]` is reasonable (consider adding
  `EdDSA` only if a product opts into Ed25519).
- **Recommended change:** None required. Optionally note that ES256 specifically (P-256) is
  the default, RS256/EdDSA are alternatives.
- **Source(s):** Supabase blog "Introducing JWT Signing Keys"; JWT Signing Keys docs; feature
  page; objectgraph migration writeup.

### 3. Phase 3 Step 9 / Phase 6 §12 — JWKS endpoint path
- **Location:** `docs/phase-3-api.md` Step 9 (`{supabase_url}/auth/v1/.well-known/jwks.json`);
  `docs/phase-6-auth.md` §12 (`{supabase_url}/auth/v1/.well-known/jwks.json`).
- **Claim:** JWKS URL = `<supabase_url>/auth/v1/.well-known/jwks.json`.
- **Status:** ✅.
- **Finding:** Correct and canonical. Official docs document
  `GET https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`. (A shorter `/auth/v1/jwks`
  appears in one third-party article; the `.well-known/jwks.json` form the guides use is the
  documented one — keep it.) The endpoint returns no keys if the project is still on HS256
  symmetric signing, which is the operational reason the HS256 fallback path can be reached.
- **Recommended change:** None.
- **Source(s):** JWT Signing Keys docs; supabase/auth#1724 (`.well-known/jwks.json` for REST).

### 4. Ruling #5 — `audience="authenticated"`
- **Location:** PHILOSOPHY.md ruling #5 (implied); Phase 3 Step 9; Phase 6 §12 + Gotchas.
- **Claim:** Verify with `audience="authenticated"`; omitting it raises `InvalidAudienceError`.
- **Status:** ✅.
- **Finding:** Correct — Supabase user access tokens carry `aud: "authenticated"`, and PyJWT
  enforces the audience when `audience=` is passed. Setting it is right.
- **Recommended change:** None.
- **Source(s):** Supabase JWT docs (access-token claims); PyJWT behavior (well established).

### 5. Ruling #4 / Phase 3 — pooler 6543 transaction-only, session mode removed 2025
- **Location:** PHILOSOPHY.md ruling #4 (lines 73–74); Phase 3 Step 3 `db.py` comment + Gotchas;
  root CLAUDE.md gotcha (Phase 8 §g).
- **Claim:** Port 6543 is transaction-mode only (session mode removed 2025); Alembic migrates
  over direct **5432** via a separate `DATABASE_MIGRATION_URL`.
- **Status:** ✅ (with a wording nuance, see Finding 6).
- **Finding:** Confirmed. Supavisor deprecated **Session Mode on 6543 effective 2025-02-28**;
  thereafter 6543 = transaction mode only, session mode on 5432, direct connection also on
  5432. Running migrations over the direct/session 5432 URL and runtime over 6543 transaction
  is the documented split. The Fly `release_command = "alembic upgrade head"` over
  `DATABASE_MIGRATION_URL` is consistent with this.
- **Recommended change:** None for the mechanism. (See Finding 6 on the "session mode removed"
  phrasing.)
- **Source(s):** Supabase changelog (Supavisor session-mode-on-6543 deprecation 2025-02-28);
  Connect-to-Postgres docs; Supavisor FAQ.

### 6. Phrasing — "session mode removed 2025"
- **Location:** PHILOSOPHY.md ruling #4; Phase 3 Step 3 comment ("session mode removed 2025").
- **Claim:** Session mode was "removed" in 2025.
- **Status:** ⚠️ (imprecise wording).
- **Finding:** Session mode was **removed from port 6543**, not removed from the product.
  Session mode is still fully available on **port 5432** (and the dedicated "Session pooler"
  endpoint). The clause reads as if session pooling no longer exists, which could mislead a
  future reader configuring a session-mode connection. The technical consequence the plan
  cares about (don't rely on persistent server-side state / prepared statements on 6543) is
  correct.
- **Recommended change:** Reword to "session mode was removed **from port 6543** in Feb 2025
  (it remains available on 5432)".
- **Source(s):** Supabase changelog; Connect-to-Postgres docs.

### 7. Phase 6 §1 — `config.toml` key set (and missing local-JWT algorithm pin)
- **Location:** `docs/phase-6-auth.md` §1 `config.toml` block + its OPEN flag.
- **Claim:** The shown `config.toml` (`[api]`/`[db]`/`[db.pooler]`/`[studio]`/`[inbucket]`/
  `[storage]`/`[auth]`/`[auth.email]`/`[analytics]`/`[realtime]`) reflects required intent;
  exact key set is "TO CONFIRM" against the pinned CLI.
- **Status:** ⚠️ (mostly correct, but incomplete given Finding 1).
- **Finding:** The section structure matches the documented CLI config reference (those table
  names and the offset-port approach are valid; the guide already correctly says to run
  `supabase init` to materialize the canonical default for the installed version). **However**,
  given Finding 1, the `[auth]` block should now also pin the JWT signing algorithm for local
  dev if HS256 is wanted. Current CLI supports `supabase gen signing-key --algorithm ES256`
  and a `signing_keys_path = "./signing_key.json"` in `config.toml`; a dedicated
  `jwt_algorithm = "HS256"` toggle was still only a feature request (supabase/cli#4726) as of
  Jan 2026, so the supported way to force HS256 locally is via the signing-keys configuration
  (or staying on a pre-2.71.1 CLI — not recommended). Also confirm whether `major_version = 17`
  matches the CLI's bundled Postgres for the pinned version.
- **Recommended change:** Add to the `[auth]` block (or document) the local signing-key
  configuration so the local stack's algorithm is deterministic and matches what `auth.py`
  expects; do not assume HS256 without pinning it.
- **Source(s):** Supabase CLI config reference (local-development/cli/config); supabase/cli#4726;
  supabase/cli#4488 (`signing_keys` config); `supabase gen signing-key`.

### 8. Ruling #4 / Phase 3 — psycopg3 + `prepare_threshold=None` + NullPool
- **Location:** PHILOSOPHY.md ruling #4; Phase 3 Step 3 `db.py`, "Config essentials" `api/db.py`
  note, Gotchas.
- **Claim:** Use psycopg v3 (`postgresql+psycopg://`) with
  `connect_args={"prepare_threshold": None}` and `poolclass=NullPool` over the 6543 pooler.
- **Status:** ✅.
- **Finding:** Matches Supabase's own guidance. Transaction mode does not support prepared
  statements; for the **pure psycopg3 driver** the documented fix is `prepare_threshold=None`
  (the asyncpg equivalents are `statement_cache_size=0` / `prepared_statement_cache_size=0`,
  which is why the plan's choice of psycopg3 over asyncpg is the cleaner path). `NullPool` is
  recommended so the app doesn't double-pool on top of Supavisor. The plan's symptom note
  (`prepared statement "__asyncpg_..." does not exist` / `DuplicatePreparedStatement`) is the
  correct failure signature.
- **Recommended change:** None. (Optional: note that `sqlalchemy[postgresql-psycopg]` +
  `psycopg[binary]` is the right dependency combo for the `+psycopg` dialect — already listed.)
- **Source(s):** Supabase "Using SQLAlchemy with Supabase" troubleshooting doc; Supavisor FAQ;
  supabase discussions #28239, #36618.

### 9. Realtime — server-side HTTP broadcast endpoint shape
- **Location:** `docs/phase-8-cicd-obs.md` §c `services/realtime.py`
  (`{SUPABASE_URL}/realtime/v1/api/broadcast`, headers `apikey` + `Authorization: Bearer
  <service_role>`, body `{"messages":[{"topic","event","payload"}]}`).
- **Claim:** POST to `/realtime/v1/api/broadcast` with the service-role key broadcasts an
  `invalidate` event on a per-product channel.
- **Status:** ✅ (with one caveat, Finding 10).
- **Finding:** The endpoint path, method, headers, and `messages[]` body shape are correct and
  match the documented HTTP broadcast API (`topic`, `event`, `payload`, optional `private`).
  Sending from the server with the service_role key without a prior WebSocket is exactly the
  supported use case.
- **Recommended change:** None to the endpoint/shape.
- **Source(s):** Realtime Broadcast docs; supabase/realtime DeepWiki WebSocket/HTTP API;
  rasc.ch Apr-2026 walkthrough.

### 10. Realtime — `private` flag / channel authorization alignment
- **Location:** `docs/phase-8-cicd-obs.md` §c (server payload omits `private`; client
  `supabase.channel(opts.channel).on("broadcast", ...)` subscribes without `{ config: { private:
  true } }`).
- **Claim:** Implicit — client and server use a plain (public) channel for invalidation events.
- **Status:** ⚠️ (works, but make the public-vs-private decision explicit).
- **Finding:** As written, both sides use a **public** channel (no `private: true` on subscribe,
  no `private` in the broadcast payload). For a public channel, any authenticated client can
  subscribe and receive these `invalidate` events with **no RLS check** — which is acceptable
  here because the payload carries only a resource name (`{"resource":"items"}`), not data, and
  the actual refetch goes through the RLS-respecting API. The schema stays private (broadcast
  rides `realtime.messages`/channels, not Postgres-Changes), so the "no RLS holes" claim holds.
  BUT: if a product later flips on private channels, the server payload must set
  `"private": true` AND the client must subscribe with `{ config: { broadcast: ... }, private:
  true }`, and you must add an INSERT/SELECT RLS policy on `realtime.messages` (authorization is
  enforced via `realtime.messages`, checked once per channel-join and cached). Also note the
  account-level "Allow public access" Realtime setting governs whether public channels are
  permitted at all.
- **Recommended change:** Document explicitly that the invalidation channel is **public by
  design** (payload is non-sensitive); add a one-line note on what changes if private channels
  are adopted (set `private: true` both sides + `realtime.messages` RLS policy). Also confirm
  the `topic` string the server sends matches the channel name the client subscribes to (both
  use `"<product>:realtime"` — good, just flag it as load-bearing).
- **Source(s):** Realtime Authorization docs; Realtime Broadcast docs; supabase blog "Broadcast
  and Presence Authorization".

### 11. Realtime — `realtime.broadcast_changes` vs raw HTTP
- **Location:** PHILOSOPHY.md Realtime bullet ("service-role HTTP call"); task brief mentions
  `realtime.broadcast_changes`.
- **Claim:** Server broadcasts via a service-role HTTP call.
- **Status:** ✅.
- **Finding:** Both mechanisms exist and are current: the **HTTP `/realtime/v1/api/broadcast`**
  endpoint (what Phase 8 uses) and the in-database **`realtime.send`** / **`realtime.broadcast_changes`**
  SQL functions (typically driven from Postgres triggers, formatted compatibly with
  Postgres-Changes). The plan deliberately chooses the HTTP path because the broadcast is
  initiated from FastAPI *after* a successful commit, not from a DB trigger — a valid and clean
  choice. `realtime.broadcast_changes` would be the alternative if you wanted DB-trigger-driven
  events, but that reintroduces DB-side coupling the plan intentionally avoids.
- **Recommended change:** None. Optionally note the trigger-based `broadcast_changes` path as a
  rejected alternative for clarity.
- **Source(s):** Realtime Broadcast docs (`realtime.send` / `broadcast_changes`); Realtime
  concepts docs.

### 12. Storage — bucket upload + public/signed URL API (supabase-js v2)
- **Location:** `docs/phase-6-auth.md` §6 `storage.ts` (`supabase.storage.from(bucket).upload`,
  `getPublicUrl`, `createSignedUrl`).
- **Claim:** Upload via `.upload(path, blob, {contentType, upsert})`; public via
  `getPublicUrl(path)` returning `{data:{publicUrl}}`; signed via `createSignedUrl(path, secs)`
  returning `{data:{signedUrl}}`.
- **Status:** ✅.
- **Finding:** All three method names and return shapes match supabase-js v2 current. `getPublicUrl`
  is synchronous (no network call) and returns `{ data: { publicUrl } }`; `createSignedUrl` is
  async returning `{ data: { signedUrl } }`; `from(bucket).upload(path, body, options)` with
  `upsert`/`contentType` is correct. The public-URL format
  `/storage/v1/object/public/<bucket>/<path>` is current. supabase-js v2 is the right major
  (current ~2.108.x, June 2026).
- **Recommended change:** None. (Minor: for React Native uploads, fetching the `file://` URI to a
  Blob works, but the more robust RN path is `ArrayBuffer` via `expo-file-system`/`fetch`+
  `arrayBuffer()` since Blob support on RN has historically been flaky — worth a gotcha note,
  not a blocker.)
- **Source(s):** supabase-js Signed-URLs/Public-Access DeepWiki; supabase-js v2 blog; npm
  `@supabase/supabase-js` (2.108.x).

### 13. supabase-js used ONLY for auth/Realtime/Storage; PKCE; storage adapter
- **Location:** PHILOSOPHY.md Topology; `docs/phase-6-auth.md` §2 `supabase.ts` (PKCE,
  `detectSessionInUrl` web-only, AsyncStorage native / localStorage web).
- **Claim:** Frontend uses supabase-js only for auth/Realtime/Storage; PKCE flow;
  platform-specific storage adapter; `autoRefreshToken`/`persistSession` on.
- **Status:** ✅.
- **Finding:** All consistent with supabase-js v2: `flowType: "pkce"` is the recommended modern
  flow, `detectSessionInUrl` should be web-only on RN, and passing a platform storage adapter
  (AsyncStorage / localStorage) with `autoRefreshToken`/`persistSession` is the documented
  pattern. Restricting the client to auth/Realtime/Storage while routing data through FastAPI
  (which holds a BYPASSRLS role) is internally consistent with deny-all RLS.
- **Recommended change:** None.
- **Source(s):** supabase-js v2 docs/blog; Supabase Auth (PKCE / session persistence) docs.

### 14. RLS deny-all default migration pattern + privileged-role bypass
- **Location:** PHILOSOPHY.md DB conventions / ruling on RLS; Phase 3 Step 20 (ENABLE + FORCE RLS,
  no policy); Phase 6 §9 (storage bucket policies).
- **Claim:** `ENABLE ROW LEVEL SECURITY` (+ `FORCE`) with **no policy** denies all access to
  non-bypassing roles; the API's privileged/BYPASSRLS role still reads/writes; Storage objects
  need explicit policies.
- **Status:** ✅ (with the role caveat the guide already flags).
- **Finding:** Correct Postgres/Supabase semantics: RLS enabled with no policy = default deny for
  the `anon`/`authenticated` roles PostgREST and Realtime use; `FORCE ROW LEVEL SECURITY` also
  subjects the table owner. The API must connect as a role that bypasses RLS. On Supabase the
  `postgres` superuser-ish role and `supabase_admin` bypass RLS; a custom `BYPASSRLS` role also
  works. The guide's own OPEN flag (Step 20) about naming the exact role is the right caveat —
  see Resolved section. Storage `storage.objects` is itself RLS-gated, so the avatars bucket
  policies in Phase 6 §9 are required (consistent).
- **Recommended change:** None beyond resolving the role name (below). Note that the `postgres`
  role exposed via the pooler connection string is the typical bypass role for the API.
- **Source(s):** Postgres RLS docs (deny-by-default); Supabase RLS / database-roles docs;
  Realtime Authorization docs (anon/authenticated roles).

### 15. Storage bucket public vs private (OPEN flag)
- **Location:** `docs/phase-6-auth.md` §9 + OPEN flags; `storage.ts` `uploadAvatar`/`signedAvatarUrl`.
- **Claim:** Ship a **public** avatars bucket for the demo (`getPublicUrl`), with a
  `signedAvatarUrl` path retained for the private variant.
- **Status:** ✅ (decision is sound; resolved below).
- **Finding:** Both paths are technically correct in supabase-js v2. For an avatar demo, a public
  bucket with `getPublicUrl` is the simplest correct choice and is the common Supabase pattern;
  per-user write is enforced by the `(<uid>/...)` prefix RLS policy on `storage.objects`. See
  Resolved section for the recommendation.
- **Recommended change:** Keep public for the template demo; keep `signedAvatarUrl` for products
  that need privacy.
- **Source(s):** Storage public/signed-URL docs; supabase-js storage reference.

### 16. CLI ports / offset scheme
- **Location:** `docs/phase-6-auth.md` §1 (base 54321, offset `+100·portIndex`); PHILOSOPHY.md generator
  step 4.
- **Claim:** Local stack ports offset per product from base 54321; API `8000+10i`.
- **Status:** ✅.
- **Finding:** Consistent with the CLI's configurable per-service ports in `config.toml`
  (`[api] port`, `[db] port`, `[studio] port`, `[inbucket] port`, etc.). Offsetting them to run
  multiple product stacks concurrently is a valid use of the config. No doc conflict.
- **Recommended change:** None.
- **Source(s):** Supabase CLI config reference; local-development overview.

### 17. `[db.pooler]` local disabled / local uses 5432 direct
- **Location:** `docs/phase-6-auth.md` §1 (`[db.pooler] enabled = false`, comment "local uses 5432
  direct"); Phase 3 test conftest uses `:5432`.
- **Claim:** Local stack uses the direct 5432 connection (no local Supavisor); the hosted pooler
  (6543) is per-env.
- **Status:** ✅.
- **Finding:** Correct and pragmatic — the local CLI exposes Postgres directly on 5432, so the
  prepared-statement/transaction-mode constraints that apply to the hosted 6543 pooler don't bite
  locally. Tests and Alembic over local 5432 are fine. The `db.py` engine still carries
  `prepare_threshold=None`/`NullPool`, which is harmless on a direct connection and correct on the
  hosted pooler.
- **Recommended change:** None.
- **Source(s):** Supabase CLI config reference; Connect-to-Postgres docs.

### 18. Sentry SDK (`@sentry/react-native`, not `sentry-expo`) — Supabase-adjacent, noted
- **Location:** PHILOSOPHY.md Cross-cutting; Phase 8 §a.
- **Claim:** Use `@sentry/react-native`; `sentry-expo` is deprecated.
- **Status:** ✅ (out of strict Supabase scope, but verified true and unchanged).
- **Finding:** `sentry-expo` is deprecated in favor of `@sentry/react-native`. Not a Supabase
  claim; flagged only because it sits in the same gotchas list as the pooler note.
- **Recommended change:** None.
- **Source(s):** Sentry React Native / Expo docs (well established).

## Resolved OPEN / TO CONFIRM (in-scope)

- **Avatars bucket: public vs private (Phase 6 §9 OPEN).** **Resolved → public** for the template
  demo. `getPublicUrl` is synchronous and correct for a public bucket; per-user write safety comes
  from the `(<uid>/...)` prefix policy on `storage.objects`, not from bucket privacy. Keep the
  `signedAvatarUrl` helper for products that flip the bucket to private (`createSignedUrl` is the
  async, expiring path). Source: Storage public/signed-URL docs.
- **`config.toml` canonical key set + CLI JWT algorithm (Phase 6 §1 OPEN).** **Resolved** — the
  table structure shown is valid against the current CLI config reference; the right procedure is
  `supabase init` to materialize the version's default, then apply offsets + `project_id`.
  **Additionally**, because the current CLI defaults the local stack to **ES256** (Finding 1), the
  `[auth]` signing-key configuration must be set deliberately if HS256-local is wanted (use
  `supabase gen signing-key --algorithm ES256` + `signing_keys_path`, or accept ES256 and exercise
  the JWKS path locally). A dedicated `jwt_algorithm` toggle was still a feature request as of Jan
  2026. Source: CLI config reference; supabase/cli#4726, #4488.
- **Privileged/BYPASSRLS role for the API (Phase 3 Step 20 OPEN).** **Resolved (guidance)** — on
  Supabase the API should connect as the `postgres` role (the role behind the standard pooler
  connection string), which owns the schema and effectively bypasses the deny-all policies that
  target `anon`/`authenticated`; `supabase_admin` and any custom `… WITH BYPASSRLS` role also
  qualify. Do **not** connect the API as `anon`/`authenticated`. Source: Supabase database-roles /
  RLS docs.
- **Local JWT verification path (ruling #5).** **Resolved** — point the API's `supabase_url` at
  `http://localhost:54321` so `PyJWKClient` resolves the local
  `/auth/v1/.well-known/jwks.json`; on a current CLI the local tokens are ES256 and verify via
  that JWKS, making the JWKS branch (not the HS256 branch) the local happy path. Source:
  supabase/cli#4726; JWT Signing Keys docs.

## Sources

- https://supabase.com/docs/guides/auth/signing-keys
- https://supabase.com/blog/jwt-signing-keys
- https://supabase.com/features/jwt-signing-keys
- https://supabase.com/docs/guides/auth/jwts
- https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys
- https://github.com/supabase/cli/issues/4726
- https://github.com/supabase/cli/issues/4488
- https://github.com/supabase/auth/issues/1724
- https://objectgraph.com/blog/migrating-supabase-jwt-jwks/
- https://medium.com/beyond-localhost/how-supabase-actually-signs-your-jwts-and-why-it-matters-ecf007798834
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/changelog
- https://supabase.com/docs/guides/troubleshooting/supavisor-faq-YyP5tI
- https://supabase.com/docs/guides/troubleshooting/using-sqlalchemy-with-supabase-FUqebT
- https://github.com/orgs/supabase/discussions/27071
- https://github.com/orgs/supabase/discussions/28239
- https://github.com/orgs/supabase/discussions/36618
- https://www.weweb.io/blog/supabase-connection-string-guide-ports-pooling
- https://supabase.com/docs/guides/realtime/broadcast
- https://supabase.com/docs/guides/realtime/authorization
- https://supabase.com/blog/supabase-realtime-broadcast-and-presence-authorization
- https://supabase.com/docs/guides/realtime/concepts
- https://deepwiki.com/supabase/realtime/4.1-websocket-api
- https://blog.rasc.ch/2026/04/supabase-realtime.html
- https://supabase.com/blog/supabase-js-v2
- https://www.npmjs.com/package/@supabase/supabase-js
- https://deepwiki.com/supabase/supabase-js/6.5-signed-urls-and-public-access
- https://supabase.com/docs/guides/local-development/cli/config
- https://supabase.com/docs/reference/cli/introduction
