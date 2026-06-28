# Phase 8 — CI/CD, observability, push, realtime, E2E & docs

**Goal:** Close the platform loop. Wire the GitHub Actions workflows that make the
monorepo deployable trunk-based (affected-only CI, Fly API deploys, EAS build + OTA,
nightly E2E + visual regression, Electron releases); add the **observability** spine
(structlog JSON logs + a `request_id` middleware in FastAPI, an `X-Request-Id` injected
by the `packages/core` API-client wrapper, Sentry init on both sides tagged with that id
→ client→API→logs traceability); template the **push notification loop** (token
registration → `/v1/push-tokens` → `send_push()` via the Expo Push API); ship the
canonical **broadcast-only realtime** pattern (API broadcasts an invalidation event on a
per-product channel after a mutation, `packages/core` subscribe-and-invalidate wires the
channel event into TanStack `invalidateQueries`); add one **scheduled job** (a Fly machine
running `tasks.py` to prune stale push tokens); stand up the **E2E harness** (Playwright
signup → login → items CRUD → realtime, plus Storybook visual-regression baselines, both
in `e2e-nightly.yml`, plus one local Maestro flow); and complete the **docs / agent
surface** (README + CLAUDE.md + `.claude/commands/` at root, `packages/ui`, and product).

**Verify (restated from the Phase 8 row):**
> push branch → CI green; touch one product → other is cache-hit; stale `openapi.json`
> fails drift check; items list refreshes across two open clients after a mutation; API
> log lines carry the `request_id`; `e2e-nightly.yml` green via `workflow_dispatch` (E2E +
> visual regression); scheduled task runs via `fly machine run` (push registration needs a
> dev build — Expo Go can't receive push tokens; verified later on real devices).

> **Naming/placeholder reminder (from PHILOSOPHY.md header):** package scope `@platform/*`; bundle
> ids `com.example.*`; infra `<org>-<product>-<env>` with org placeholder `example`; product
> token `template`; clearly-marked placeholders are `example`, `com.example.*`,
> `TODO-EAS-PROJECT-ID`, the releases-repo owner. Every repo/org value in the YAML below is a
> placeholder — swap when real infra accounts exist. Release tags are EXACTLY
> `<product>-<surface>-v*` (surface ∈ api/app/desktop) and the OTA tag is `<product>-ota-v*`;
> EAS Update channels are EXACTLY `staging` / `production`.

---

## Prerequisites

Phase 8 is the capstone — it assumes **Phases 1–7 are complete** and both products exist:

1. **Phase 1** — root tooling: `mise.toml` (Node 24 LTS / pnpm 11 / Python 3.13 / uv),
   `pnpm-workspace.yaml` (`nodeLinker: hoisted` — pnpm 11 relocates this out of `.npmrc`),
   `.npmrc` (auth/registry only), `turbo.json` (2.9 `tasks`),
   `tsconfig.base.json`, `lefthook.yml`, `packages/config`. `turbo run lint` is a clean
   no-op.
2. **Phase 2** — `packages/ui` (owned react-native-reusables primitives, theme infra,
   **Storybook** workbench with theme/brand toolbar + per-variant `*.stories.tsx`),
   `packages/core` (query client + persistence, env), `_template/app` shell.
3. **Phase 3** — `_template/api`: strict layered OOP (`models/` → `services/` → `schemas/`
   → `routers/`), problem+json, cursor pagination, `security.py`, `middleware.py` stub,
   `/healthz` + `/v1/hello` + `/v1/items` CRUD, `db.py`, `auth.py`, Alembic initial
   migration (RLS deny-all), `seed.py`, polyfactory factories, Dockerfile, fly tomls,
   pytest against real Postgres.
4. **Phase 4** — typegen: `export_openapi.py`, `api-client/` (hey-api), turbo wiring,
   `features/home` list via the generated `useInfiniteQuery` hook.
5. **Phase 5** — desktop: `app://` protocol shell, electron-builder.yml, updater wired
   (no-op without a releases repo).
6. **Phase 6** — Supabase local + auth: core session store + guards, `features/auth`
   login/signup, protected `/v1/me`, `core/storage.ts` + avatar upload.
7. **Phase 7** — generator + stamped **`demo`** product (portIndex 1). Both products build
   under `--affected`; `pnpm bootstrap` runs both local stacks; `git grep -iw template
   products/demo` is empty.

This guide **adds files** to `_template` (token-rewritten into `demo` by re-running the
generator, or by the patterns being copied forward); it does **not** re-stamp `demo`.
Several files from earlier phases are **extended here** (notably `api/middleware.py`,
`api/sentry.ts` ↔ `core/sentry.ts`, `core/api.ts`, `core/realtime.ts`, `core/notifications.ts`,
`api/tasks.py`, `api/models/`, `api/routers/`, `api/services/`) — when a file already exists
from an earlier phase the step says so.

---

## Definition of done

- [ ] **Observability:** `api/.../middleware.py` assigns a `request_id` per request
      (reads inbound `X-Request-Id`, else generates one), binds it into a structlog
      contextvar, echoes it back in the `X-Request-Id` response header, and emits **JSON**
      access logs carrying it. `core/api.ts` generates+injects `X-Request-Id` on every
      request. Sentry is initialised on both sides and **tags events with the request id**.
- [ ] **Push loop:** `core/notifications.ts` registers an Expo push token and POSTs it to
      `/v1/push-tokens`; `api/.../models/push_token.py` + `routers/push.py` +
      `PushService.send_push()` (httpx → Expo Push API) exist; `test_push.py` passes with a
      **mocked httpx transport**.
- [ ] **Realtime broadcast-only:** `ItemService` broadcasts an invalidation event on the
      per-product channel (service-role HTTP to Supabase) after every items mutation;
      `core/realtime.ts` subscribes and calls `queryClient.invalidateQueries`; the home
      list is wired to it. **No Postgres-Changes subscriptions, no RLS holes.**
- [ ] **Scheduled job:** `api/.../tasks.py` exposes a `prune_push_tokens` entrypoint
      runnable as `python -m template_api.tasks prune-push-tokens`; documented as a Fly
      scheduled machine (`fly machine run … --schedule`).
- [ ] **E2E harness:** `products/_template/app/playwright.config.ts` + `app/e2e/*.spec.ts`
      (signup → login → items CRUD → realtime) run against exported `dist` + local API +
      Supabase local. A Storybook VR Playwright script iterates `storybook-static/index.json`
      and screenshots each story × {light,dark}; baselines committed. One `.maestro/` flow
      exists (local only).
- [ ] **Workflows:** `ci.yml`, `deploy-api.yml`, `eas-build.yml`, `eas-update.yml`,
      `e2e-nightly.yml`, `electron-release.yml` all present in `.github/workflows/`, valid
      YAML, using clearly-marked placeholders.
- [ ] **Docs/agent surface:** root `CLAUDE.md` + `README.md`; `packages/ui/CLAUDE.md` +
      `FIGMA.md`; product `CLAUDE.md` + `README.md` (+ nested api CLAUDE.md recipe);
      `.claude/commands/` at all three levels with the documented command inventories.
- [ ] All **Verification** commands pass.

---

## Build steps

> Run from repo root unless noted. Paths are repo-relative. `<product>` token in `_template`
> is the literal `template`; the generator rewrites it.

### (a) Observability — request_id, structlog JSON, Sentry both sides, X-Request-Id

**Files**
- `products/_template/api/src/template_api/middleware.py` *(extend — created as a stub in
  Phase 3)*
- `products/_template/api/src/template_api/logging.py` *(new — structlog config)*
- `products/_template/api/src/template_api/sentry.py` *(new — server Sentry init)*
- `products/_template/api/src/template_api/main.py` *(extend — register middleware + init)*
- `packages/core/src/api.ts` *(extend — X-Request-Id injection)*
- `packages/core/src/sentry.ts` *(extend — tag request id)*
- `products/_template/app/app.config.ts` *(extend — add the `@sentry/react-native/expo`
  config plugin; cross-reference Phase 2 step (h))*
- `products/_template/app/metro.config.ts` *(extend — compose `getSentryExpoConfig` with
  `withNativeWind`; created in Phase 2)*

**Contents**

`api/.../logging.py` — structlog rendering JSON, sharing stdlib's stream:
```python
import logging
import sys
import structlog

request_id_var: structlog.contextvars  # documented contextvar key: "request_id"

def configure_logging(*, level: str = "INFO") -> None:
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level)
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,   # pulls request_id into every line
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.dict_tracebacks,
            structlog.processors.JSONRenderer(),        # JSON logs
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.getLevelName(level)),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )

log = structlog.get_logger()
```

`api/.../middleware.py` — request id + structlog binding + access log:
```python
import time
import uuid
import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.types import ASGIApp

REQUEST_ID_HEADER = "X-Request-Id"
log = structlog.get_logger()

class RequestIdMiddleware(BaseHTTPMiddleware):
    """Bind a request_id for the lifetime of the request: honour an inbound
    X-Request-Id (set by the core api-client wrapper) or mint a UUIDv4, expose it
    on structlog contextvars + Sentry scope, echo it on the response."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get(REQUEST_ID_HEADER) or uuid.uuid4().hex
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=rid)
        # tag Sentry so server-side events carry the same id (client→API→logs)
        try:
            import sentry_sdk
            sentry_sdk.set_tag("request_id", rid)
        except Exception:  # Sentry optional in local/dev
            pass
        request.state.request_id = rid
        start = time.perf_counter()
        response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = rid
        log.info(
            "http_request",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=round((time.perf_counter() - start) * 1000, 2),
        )
        return response
```

`api/.../sentry.py`:
```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from .settings import settings   # SENTRY_DSN, ENV (staging|production), RELEASE

def init_sentry() -> None:
    if not settings.SENTRY_DSN:
        return  # no-op locally / in CI without a DSN
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENV,
        release=settings.RELEASE,
        integrations=[FastApiIntegration(), StarletteIntegration()],
        traces_sample_rate=0.1,
        send_default_pii=False,
    )
```

`api/.../main.py` (excerpt — order matters, request-id middleware **outermost** so it wraps
errors too):
```python
configure_logging(level=settings.LOG_LEVEL)
init_sentry()
app = FastAPI(...)
# security middleware (CORS/headers/slowapi) from Phase 3 added first (inner),
# request-id added LAST so it is the outermost layer:
app.add_middleware(RequestIdMiddleware)
```

`packages/core/src/api.ts` (extend the hey-api client wrapper — inject id + auth header):
```ts
import { client } from "@platform/<product>-api-client"; // hey-api client-fetch instance
import { captureRequestId } from "./sentry";

// crypto.randomUUID exists on web + Hermes (RN 0.85). Fallback kept for safety.
function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function configureApiClient(opts: { baseUrl: string; getToken: () => string | null }) {
  client.setConfig({ baseUrl: opts.baseUrl });
  client.interceptors.request.use((request) => {
    const rid = newRequestId();
    request.headers.set("X-Request-Id", rid);
    captureRequestId(rid);              // tag the client-side Sentry scope
    const token = opts.getToken();
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    return request;
  });
}
```

`packages/core/src/sentry.ts` (extend — note `@sentry/react-native`, NOT `sentry-expo`):
```ts
import * as Sentry from "@sentry/react-native";
import { env } from "./env";

export function initSentry() {
  if (!env.EXPO_PUBLIC_SENTRY_DSN) return; // no-op without DSN
  Sentry.init({
    dsn: env.EXPO_PUBLIC_SENTRY_DSN,
    environment: env.EXPO_PUBLIC_ENV,      // staging | production
    tracesSampleRate: 0.1,
  });
}

export function captureRequestId(requestId: string) {
  Sentry.setTag("request_id", requestId); // matches the API tag → traceable
}
```
> `Sentry.init()` alone is NOT enough for production source maps / native symbolication — it
> ships the JS-only runtime half. For Expo you ALSO need the build-time half: the config
> plugin (below) + Metro wiring (below). Pin `@sentry/react-native` to a release that lists
> **Expo SDK 56 / RN 0.85** support.

`app/app.config.ts` (extend — add the Expo config plugin; cross-reference the Phase 2
`app.config.ts` that already sets `scheme`, bundle ids, `extra.eas.projectId`, and the
`updates.url` + `runtimeVersion` OTA policy):
```ts
// inside the Expo config `plugins` array:
plugins: [
  // ...existing plugins (expo-router, etc.)
  [
    "@sentry/react-native/expo",
    {
      // organization/project + auth token enable source-map upload at build time.
      // SENTRY_AUTH_TOKEN is a BUILD env var (EAS secret) — never committed.
      organization: "example",      // PLACEHOLDER org slug
      project: "example-template",  // PLACEHOLDER Sentry project slug
    },
  ],
],
```

`app/metro.config.ts` (extend — compose Sentry's Metro config with NativeWind; created in
Phase 2 with `getDefaultConfig` + `withNativeWind`):
```ts
const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { withNativeWind } = require("nativewind/metro");

// Sentry FIRST (replaces getDefaultConfig), THEN wrap with NativeWind.
const config = getSentryExpoConfig(__dirname);
config.watchFolders = [workspaceRoot];           // ../../.. — preserve Phase 2 monorepo wiring
config.resolver.nodeModulesPaths = [
  projectRoot + "/node_modules",
  workspaceRoot + "/node_modules",
];
module.exports = withNativeWind(config, { input: "./global.css" });
```
> ⚠️ REVIEW: Phase 2's `metro.config.js` uses `getDefaultConfig`; here it is swapped for
> `getSentryExpoConfig(__dirname)` (which internally calls `getDefaultConfig` and adds the
> Sentry serializer). Keep the existing `watchFolders`/`nodeModulesPaths` monorepo wiring.

**Commands**
```bash
cd products/_template/api && uv add structlog "sentry-sdk[fastapi]" && cd -
pnpm --filter @platform/core add @sentry/react-native
# the Expo config plugin + Metro helper ship inside the same package — no extra install.
turbo run typecheck --filter=*template-api --filter=@platform/core
```

**Why** — PHILOSOPHY.md Observability: "Sentry + structlog JSON logs + request_id middleware; the
API-client wrapper sends a generated X-Request-Id per request; Sentry events tagged with it
on both sides → client→API→logs traceability." `@sentry/react-native` is the locked SDK
(`sentry-expo` is deprecated; pin a release listing Expo SDK 56 / RN 0.85 support). On Expo,
`Sentry.init()` is only the runtime half — production source maps and native symbolication
need the `@sentry/react-native/expo` **config plugin** in `app.config.ts` PLUS `getSentryExpoConfig`
**Metro** wiring composed with `withNativeWind` (and `SENTRY_AUTH_TOKEN` as an EAS build secret,
never committed). The request-id middleware must be outermost so even error responses carry
the id; structlog `merge_contextvars` is what threads the id into every log line emitted during
the request.

---

### (b) Push loop — register → /v1/push-tokens → send_push()

**Files**
- `packages/core/src/notifications.ts` *(extend — created stub in Phase 2/6 tree)*
- `products/_template/api/src/template_api/models/push_token.py` *(new)*
- `products/_template/api/src/template_api/schemas/push.py` *(new — DTOs)*
- `products/_template/api/src/template_api/services/push.py` *(new — `PushService`)*
- `products/_template/api/src/template_api/routers/push.py` *(new — `/v1/push-tokens`)*
- `products/_template/api/alembic/versions/<rev>_push_tokens.py` *(new migration — RLS deny-all)*
- `products/_template/api/tests/test_push.py` *(new)*

**Contents**

`core/notifications.ts`:
```ts
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { postV1PushTokens } from "@platform/<product>-api-client"; // generated SDK fn

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null; // simulators/Expo Go cannot receive a token
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return null;
  const { data: token } = await Notifications.getExpoPushTokenAsync();
  await postV1PushTokens({ body: { token, platform: Device.osName ?? "unknown" } });
  return token;
}
```

`api/.../models/push_token.py` (SQLModel, UUIDv7 base from Phase 3):
```python
from sqlmodel import Field, UniqueConstraint
from .base import UUIDBase   # UUIDv7 PK base from Phase 3

class PushToken(UUIDBase, table=True):
    __tablename__ = "push_token"
    __table_args__ = (UniqueConstraint("user_id", "token", name="uq_push_user_token"),)
    user_id: str = Field(index=True)        # Supabase auth uid
    token: str                              # ExponentPushToken[...]
    platform: str = "unknown"
```

`api/.../schemas/push.py`:
```python
from pydantic import BaseModel, ConfigDict

class PushTokenIn(BaseModel):
    model_config = ConfigDict(strict=True)
    token: str
    platform: str = "unknown"

class PushTokenOut(BaseModel):
    id: str
    token: str
    platform: str
```

`api/.../services/push.py` (service holds the session; httpx for the external call):
```python
import httpx
import structlog
from sqlmodel import Session, select
from ..models.push_token import PushToken
from .base import BaseService

log = structlog.get_logger()
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

class PushService(BaseService):
    def register(self, *, user_id: str, token: str, platform: str) -> PushToken:
        existing = self.session.exec(
            select(PushToken).where(PushToken.user_id == user_id, PushToken.token == token)
        ).first()
        if existing:
            return existing
        row = PushToken(user_id=user_id, token=token, platform=platform)
        self.session.add(row)
        self.session.commit()
        self.session.refresh(row)
        return row

    async def send_push(self, *, user_id: str, title: str, body: str,
                        http: httpx.AsyncClient | None = None) -> None:
        tokens = self.session.exec(
            select(PushToken.token).where(PushToken.user_id == user_id)
        ).all()
        if not tokens:
            return
        messages = [{"to": t, "title": title, "body": body} for t in tokens]
        client = http or httpx.AsyncClient(timeout=10.0)
        try:
            resp = await client.post(EXPO_PUSH_URL, json=messages)
            resp.raise_for_status()
            log.info("push_sent", count=len(messages))
        finally:
            if http is None:
                await client.aclose()
```
> `http` is injectable so `test_push.py` passes an `httpx.AsyncClient` backed by
> `httpx.MockTransport` (mocking conventions: API unit tests mock external HTTP via httpx
> mock transport).

`api/.../routers/push.py` (thin; depends on the service + `CurrentUser`):
```python
from fastapi import APIRouter, Depends
from ..auth import CurrentUser
from ..schemas.push import PushTokenIn, PushTokenOut
from ..services.push import PushService

router = APIRouter(prefix="/v1/push-tokens", tags=["push"])

@router.post("", response_model=PushTokenOut, status_code=201)
def register_token(body: PushTokenIn, user: CurrentUser,
                   svc: PushService = Depends(PushService)) -> PushTokenOut:
    row = svc.register(user_id=user.id, token=body.token, platform=body.platform)
    return PushTokenOut(id=str(row.id), token=row.token, platform=row.platform)
```

`tests/test_push.py` (excerpt):
```python
import httpx, pytest
from template_api.services.push import PushService

@pytest.mark.asyncio
async def test_send_push_mocks_expo(session, user):
    PushService(session).register(user_id=user.id, token="ExponentPushToken[x]", platform="ios")
    seen = {}
    def handler(req: httpx.Request) -> httpx.Response:
        seen["body"] = req.content
        return httpx.Response(200, json={"data": [{"status": "ok"}]})
    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as http:
        await PushService(session).send_push(user_id=user.id, title="hi", body="yo", http=http)
    assert b"ExponentPushToken" in seen["body"]
```

**Commands**
```bash
cd products/_template/api && uv add httpx && uv run alembic revision --autogenerate -m "push_tokens" && cd -
pnpm --filter @platform/<product>-app add expo-notifications expo-device
# After editing the new migration to add RLS deny-all on push_token:
cd products/_template/api && uv run alembic upgrade head && uv run pytest tests/test_push.py && cd -
turbo run openapi --filter=*template-api   # regenerate openapi.json (push endpoint now in contract)
```

**Why** — PHILOSOPHY.md: "Push notifications: full loop templated — token registration in the app
(expo-notifications), `/v1/push-tokens` endpoint + table (per user+device), `send_push()`
service calling Expo's Push API via httpx." The new migration must include **RLS deny-all**
on `push_token` (DB convention: every table RLS deny-all; the API's privileged role bypasses
it). Expo Go cannot receive a token — registration only works in a dev build (gotcha below).

---

### (c) Realtime broadcast-only — API broadcast + core subscribe-and-invalidate

**Files**
- `products/_template/api/src/template_api/services/realtime.py` *(new — broadcast helper)*
- `products/_template/api/src/template_api/services/items.py` *(extend — broadcast on mutation)*
- `packages/core/src/realtime.ts` *(extend — subscribe-and-invalidate)*
- `products/_template/app/features/home/*` *(extend — wire the subscription)*

**Contents**

`api/.../services/realtime.py` — broadcast via Supabase Realtime's HTTP broadcast endpoint
using the **service role** key (tables stay RLS-locked; we never open Postgres-Changes):
```python
import httpx
import structlog
from ..settings import settings   # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

log = structlog.get_logger()

async def broadcast_invalidate(resource: str, *, http: httpx.AsyncClient | None = None) -> None:
    """Tell clients on the per-product channel to invalidate `resource`.
    Channel name is product-scoped: `<product>:realtime`. No DB subscription opened."""
    url = f"{settings.SUPABASE_URL}/realtime/v1/api/broadcast"
    payload = {"messages": [{
        "topic": "<product>:realtime",
        "event": "invalidate",
        "payload": {"resource": resource},
    }]}
    headers = {
        "apikey": settings.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_ROLE_KEY}",
    }
    client = http or httpx.AsyncClient(timeout=5.0)
    try:
        resp = await client.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        log.info("broadcast", resource=resource)
    finally:
        if http is None:
            await client.aclose()
```
> ⚠️ REVIEW: the broadcast-only architecture and the client side
> (`supabase.channel(...).on("broadcast", {event}, cb).subscribe()`) are confirmed current
> supabase-js. The **server-side HTTP broadcast path** `POST /realtime/v1/api/broadcast` with
> `apikey` + service-role bearer matches Supabase's documented "send broadcast from the
> server" REST approach, but Supabase has iterated on Realtime auth (RLS on
> `realtime.messages`); verify the exact path + whether the service-role key alone suffices
> against the live project when it exists. The architecture does not change either way.

`api/.../services/items.py` (extend the create/update/delete paths — broadcast after commit):
```python
from .realtime import broadcast_invalidate

class ItemService(BaseService):
    async def create(self, data: ItemCreate) -> Item:
        row = Item(**data.model_dump())
        self.session.add(row); self.session.commit(); self.session.refresh(row)
        await broadcast_invalidate("items")   # clients refetch through the API
        return row
    # update() / delete() call broadcast_invalidate("items") after their commit too
```
> Router methods that call these become `async def` and `await` the service — the broadcast
> is fire-and-don't-block-correctness; failures are logged, not fatal (catch in the service
> or let it raise per product policy). ⚠️ OPEN / TO CONFIRM: PHILOSOPHY.md does not pin whether a
> broadcast failure should fail the mutation — default here is "log + swallow" so a Realtime
> outage never breaks writes; confirm per product.

`packages/core/src/realtime.ts` (the shipped subscribe-and-invalidate helper):
```ts
import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

// Wires channel `invalidate` events → TanStack invalidation. No Postgres-Changes.
export function subscribeAndInvalidate(
  supabase: SupabaseClient,
  queryClient: QueryClient,
  opts: { channel: string },           // e.g. "<product>:realtime"
) {
  const channel = supabase
    .channel(opts.channel)
    .on("broadcast", { event: "invalidate" }, (msg) => {
      const resource = (msg.payload as { resource?: string }).resource;
      if (resource) queryClient.invalidateQueries({ queryKey: [resource] });
    })
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
```

`app/features/home/*` (wire it — call inside the home screen's effect):
```ts
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase, subscribeAndInvalidate } from "@platform/core";

export function useItemsRealtime() {
  const queryClient = useQueryClient();
  useEffect(
    () => subscribeAndInvalidate(supabase, queryClient, { channel: "<product>:realtime" }),
    [queryClient],
  );
}
```
> The generated items query key must be `["items", ...]` (hey-api TanStack plugin key) so
> `invalidateQueries({ queryKey: ["items"] })` matches. Confirm the generated key prefix in
> `api-client/`.

**Commands**
```bash
turbo run typecheck --filter=@platform/core --filter=*template-api
turbo run test --filter=*template-api      # service tests can mock broadcast httpx transport
```

**Why** — PHILOSOPHY.md Realtime (canonical, locked): "broadcast-only — tables stay RLS-locked;
after mutations FastAPI broadcasts invalidation events on per-product channels (service-role
HTTP call); clients refetch through the API. `packages/core` ships the subscribe-and-invalidate
helper. No Postgres-Changes subscriptions, no RLS holes, schema stays private." The channel is
**per-product** (`<product>:realtime`) so two products never cross-talk.

---

### (d) Scheduled job — prune stale push tokens via a Fly machine

**Files**
- `products/_template/api/src/template_api/tasks.py` *(extend — stub in Phase 3 tree)*
- `products/_template/api/fly.staging.toml` / `fly.production.toml` *(reference only — the
  scheduled machine is created via CLI, documented here)*

**Contents**

`api/.../tasks.py` — a tiny CLI module (no queue infra; one example task):
```python
"""Scheduled jobs run as one-off Fly machines: `python -m template_api.tasks <task>`."""
import sys
from datetime import datetime, timedelta, timezone
import structlog
from sqlmodel import Session, delete
from .db import engine
from .logging import configure_logging
from .models.push_token import PushToken

log = structlog.get_logger()
STALE_AFTER = timedelta(days=90)

def prune_push_tokens() -> int:
    cutoff = datetime.now(timezone.utc) - STALE_AFTER
    with Session(engine) as session:
        # SQLModel's session.exec() only types select(); delete()/update() MUST go through
        # SQLAlchemy's session.execute() — exec(delete(...)) fails pyright strict and lacks
        # .rowcount. execute(delete(...)) returns a Result whose .rowcount is valid.
        result = session.execute(delete(PushToken).where(PushToken.updated_at < cutoff))
        session.commit()
        count = result.rowcount or 0
    log.info("pruned_push_tokens", count=count)
    return count

TASKS = {"prune-push-tokens": prune_push_tokens}

def main() -> None:
    configure_logging()
    if len(sys.argv) != 2 or sys.argv[1] not in TASKS:
        raise SystemExit(f"usage: python -m template_api.tasks <{'|'.join(TASKS)}>")
    TASKS[sys.argv[1]]()

if __name__ == "__main__":
    main()
```
> Requires an `updated_at` column on `PushToken` (add to the UUIDv7 base or the model). ⚠️
> OPEN / TO CONFIRM: PHILOSOPHY.md says "prune stale push tokens" but does not define "stale" —
> 90 days by last-update is a documented default; confirm per product.

**Commands** (run against the staging Fly app — `<org>` placeholder):
```bash
# one-off run (the Verify step):
fly machine run \
  --app example-template-api-stg \
  registry.fly.io/example-template-api-stg:latest \
  python -m template_api.tasks prune-push-tokens

# scheduled (daily) machine — Fly's built-in scheduler, no queue infra:
fly machine run \
  --app example-template-api-stg \
  --schedule daily \
  registry.fly.io/example-template-api-stg:latest \
  python -m template_api.tasks prune-push-tokens
```
> `fly machine run --schedule` takes **interval keywords ONLY** —
> `hourly` / `daily` / `weekly` / `monthly` (NOT cron expressions) — and runs are **"fuzzy"**
> (approximate, not guaranteed at an exact minute). `daily` is fine for prune-stale-tokens. If
> a product ever needs precise cron (e.g. `0 4 * * *`), use Fly's **Cron Manager** (per-job
> isolated machines) or **Supercronic** per Fly's task-scheduling blueprint — `--schedule`
> alone won't do it. The one-off Verify run (no `--schedule`) is a correct one-shot.

**Why** — PHILOSOPHY.md Background/scheduled jobs: "Fly scheduled machines running a lightweight
`tasks` module in the api (no queue infra); template ships one example (prune stale push
tokens)." The task module reuses the API's `engine` + structlog config so logs are JSON and
land in the same place. `--schedule` is Fly's native (keyword-based, fuzzy) scheduler — exact
cron needs Cron Manager / Supercronic.

---

### (e) E2E harness — Playwright web E2E + Storybook visual regression + Maestro

**Files**
- `products/_template/app/playwright.config.ts` *(new)*
- `products/_template/app/e2e/items.spec.ts` *(new — signup → login → CRUD → realtime)*
- `products/_template/app/e2e/global-setup.ts` *(new — build dist, start API + supabase)*
- `packages/ui/.storybook/visual-regression.spec.ts` *(new — VR over storybook-static)*
- `packages/ui/playwright.config.ts` *(new — VR project)*
- `products/_template/app/.maestro/login.yaml` *(new — local mobile flow)*

**Contents**

`app/playwright.config.ts`:
```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  use: { baseURL: "http://localhost:8081", trace: "on-first-retry" },
  webServer: {
    command: "npx serve dist -l 8081",   // exported SPA from `expo export --platform web`
    url: "http://localhost:8081",
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
});
```

`app/e2e/items.spec.ts` (skeleton — full-stack flow):
```ts
import { test, expect } from "@playwright/test";

test("signup → login → items CRUD → realtime", async ({ browser }) => {
  const a = await browser.newContext();
  const pageA = await a.newPage();
  const email = `e2e+${Date.now()}@example.com`;

  await pageA.goto("/signup");
  await pageA.getByLabel("Email").fill(email);
  await pageA.getByLabel("Password").fill("Passw0rd!");
  await pageA.getByRole("button", { name: "Sign up" }).click();
  await expect(pageA.getByRole("tab", { name: "Home" })).toBeVisible();

  // create an item
  await pageA.getByRole("button", { name: "Add item" }).click();
  await pageA.getByLabel("Title").fill("first item");
  await pageA.getByRole("button", { name: "Save" }).click();
  await expect(pageA.getByText("first item")).toBeVisible();

  // realtime: a SECOND client sees the next mutation without manual refresh
  const b = await browser.newContext({ storageState: await a.storageState() });
  const pageB = await b.newPage();
  await pageB.goto("/");
  await pageA.getByRole("button", { name: "Add item" }).click();
  await pageA.getByLabel("Title").fill("broadcast item");
  await pageA.getByRole("button", { name: "Save" }).click();
  await expect(pageB.getByText("broadcast item")).toBeVisible({ timeout: 10_000 });
});
```

`app/e2e/global-setup.ts` (skeleton — orchestrates the real stack):
```ts
import { execSync } from "node:child_process";

export default async function globalSetup() {
  // 1. local Supabase (per-product offset ports from config.toml)
  execSync("pnpm --filter @platform/<product>-api supabase:start", { stdio: "inherit" });
  // 2. migrate + seed
  execSync("cd products/_template/api && uv run alembic upgrade head && uv run python -m template_api.seed", { stdio: "inherit" });
  // 3. start the API (background — see note)
  // 4. export the web bundle for `npx serve dist`
  execSync("turbo run export:web --filter=*template-app", { stdio: "inherit" });
}
```
> ⚠️ OPEN / TO CONFIRM: PHILOSOPHY.md says E2E runs "against exported dist + api + supabase local"
> but does not pin the exact process-management glue (background API + teardown). The
> skeleton above starts Supabase + exports dist; the API server should be launched as a
> backgrounded process here (or via a second Playwright `webServer` entry) and torn down in a
> `globalTeardown`. Confirm the process orchestration when wiring CI.

`packages/ui/.storybook/visual-regression.spec.ts` (iterate `storybook-static/index.json`):
```ts
import fs from "node:fs";
import { test, expect } from "@playwright/test";

const index = JSON.parse(fs.readFileSync("storybook-static/index.json", "utf8"));
const stories = Object.values<{ id: string; type?: string }>(index.entries).filter(
  (e) => e.type === "story",
);

for (const story of stories) {
  for (const theme of ["light", "dark"] as const) {
    test(`${story.id} [${theme}]`, async ({ page }) => {
      await page.goto(`/iframe.html?id=${story.id}&globals=theme:${theme}`);
      await page.waitForSelector("#storybook-root");
      await expect(page).toHaveScreenshot(`${story.id}--${theme}.png`);
    });
  }
}
```

`packages/ui/playwright.config.ts` (VR project against the static build):
```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".storybook",
  testMatch: "visual-regression.spec.ts",
  use: { baseURL: "http://localhost:6006" },
  webServer: {
    command: "npx http-server storybook-static -p 6006 -s",
    url: "http://localhost:6006",
    reuseExistingServer: !process.env.CI,
  },
  // committed baselines live next to the spec; update with --update-snapshots
});
```

`app/.maestro/login.yaml` (local-only mobile flow):
```yaml
appId: com.example.template
---
- launchApp
- tapOn: "Email"
- inputText: "demo@example.com"
- tapOn: "Password"
- inputText: "Passw0rd!"
- tapOn: "Log in"
- assertVisible: "Home"
```

**Commands**
```bash
pnpm --filter @platform/<product>-app add -D @playwright/test serve
pnpm --filter @platform/ui add -D @playwright/test http-server
# commit VR baselines (first run authors them):
pnpm --filter @platform/ui storybook:build      # → storybook-static/
pnpm --filter @platform/ui exec playwright test --update-snapshots
# run web E2E locally:
pnpm --filter @platform/<product>-app exec playwright test
# Maestro (local, needs a running simulator/dev build):
maestro test products/_template/app/.maestro/login.yaml
```

**Why** — PHILOSOPHY.md Testing strategy: web E2E (signup → login → items CRUD → realtime) and
visual regression (Playwright screenshots of the static Storybook build, each story ×
{light,dark}, committed baselines) both run **nightly** in `e2e-nightly.yml` (+
`workflow_dispatch`). Maestro is **local-only initially** (CI via EAS Workflows deferred).
VR visits `iframe.html?id=<story>&globals=theme:dark|light` per the Storybook config note.

---

### (f) Workflows — REAL YAML

> All `secrets.*`, repo owners, and app names below are **clearly-marked placeholders**.
> `example` is the org placeholder; swap on real-infra day.

#### `ci.yml`

**Files** — `.github/workflows/ci.yml`

**Contents**
```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0          # turbo --affected needs history for the base diff
      - uses: jdx/mise-action@v4  # installs Node 24 / pnpm 11 / Python 3.13 / uv from mise.toml
                                   # v4 = Node-24 action runtime (Node 20 is EOL on GH runners); commit a mise.lock for locked installs
      - run: pnpm install --frozen-lockfile
      - name: uv sync (affected APIs)
        run: |
          for api in products/*/api; do
            uv sync --frozen --project "$api"
          done
      - name: Lint / typecheck / test / build / openapi (affected only)
        env:
          # Explicit base/head so `--affected` scopes correctly regardless of squash-merge
          # histories: PR base sha on pull_request, the pushed-from sha on push to main.
          TURBO_SCM_BASE: ${{ github.event.pull_request.base.sha || github.event.before }}
          TURBO_SCM_HEAD: ${{ github.sha }}
        run: pnpm turbo run lint typecheck test build openapi --affected
      - name: Typegen drift check
        run: |
          git diff --exit-code products/*/api-client products/*/api/openapi.json
    services:
      postgres:                   # real Postgres for API integration tests
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready" --health-interval 10s
          --health-timeout 5s --health-retries 5
```
> RESOLVED (affected base ref): with `fetch-depth: 0`, Turborepo 2.x auto-detects the base
> (PR base ref on `pull_request`, previous commit on `push` to `main`) — usually correct. To
> be robust against squash-merge histories and shallow edge cases, the step above sets
> `TURBO_SCM_BASE`/`TURBO_SCM_HEAD` explicitly (`github.event.pull_request.base.sha` on PRs,
> `github.event.before` on push). The `uv sync` loop is the documented "uv sync affected
> apis" — a coarse all-APIs sync; a stricter affected filter can be layered later.

**Commands** — `git push origin <branch>` → Actions runs it. Locally:
`pnpm turbo run lint typecheck test build openapi --affected`.

**Why** — PHILOSOPHY.md Workflows: "ci.yml — mise-action → pnpm frozen install → uv sync (affected
apis) → `turbo run lint typecheck test build openapi --affected` → drift check." The drift
check is the contract guard — a stale `openapi.json` or generated client makes `git diff
--exit-code` non-zero and fails CI.

#### `deploy-api.yml`

**Files** — `.github/workflows/deploy-api.yml`

**Contents**
```yaml
name: Deploy API
on:
  push:
    branches: [main]                    # → staging
    tags: ["*-api-v*"]                  # <product>-api-v* → production
jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      products: ${{ steps.filter.outputs.changes }}
    steps:
      - uses: actions/checkout@v6
      - uses: dorny/paths-filter@v4
        id: filter
        with:
          filters: |
            template: ['products/_template/api/**', 'packages/**']
            demo: ['products/demo/api/**', 'packages/**']
  deploy:
    needs: changes
    if: ${{ needs.changes.outputs.products != '[]' }}
    runs-on: ubuntu-latest
    strategy:
      matrix:
        product: ${{ fromJSON(needs.changes.outputs.products) }}
    steps:
      - uses: actions/checkout@v6
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - name: Deploy (staging on main, production on tag)
        working-directory: products/${{ matrix.product == 'template' && '_template' || matrix.product }}/api
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}   # PLACEHOLDER secret
        run: |
          if [[ "${GITHUB_REF}" == refs/tags/* ]]; then
            flyctl deploy -c fly.production.toml --remote-only
          else
            flyctl deploy -c fly.staging.toml --remote-only
          fi
```
> Alembic runs as the Fly **release_command** (Key ruling #4) over the direct 5432
> `DATABASE_MIGRATION_URL` — not a CI step. The `paths-filter` includes `packages/**` so a
> shared-package change can trigger an API redeploy if its image embeds shared TS (typically
> it does not — APIs are Python-only — but the filter is conservative).

**Commands** — staging is automatic on merge to `main`. Production:
`git tag template-api-v1.2.0 && git push origin template-api-v1.2.0`.

**Why** — PHILOSOPHY.md: "deploy-api.yml — paths-filter on `products/*/api/** + packages/**` →
matrix `flyctl deploy -c fly.staging.toml`; tags → prod." Trunk-based: `main` → staging,
`<product>-api-v*` tag → that product's production.

#### `eas-build.yml`

**Files** — `.github/workflows/eas-build.yml`

**Contents**
```yaml
name: EAS Build
on:
  workflow_dispatch:
    inputs:
      product: { description: "product token (e.g. template, demo)", required: true }
      profile: { description: "EAS build profile", required: true, default: "production" }
  push:
    tags: ["*-app-v*"]                  # <product>-app-v* → store build
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: jdx/mise-action@v4
      - run: pnpm install --frozen-lockfile     # honours pnpm-workspace.yaml `nodeLinker: hoisted` (pnpm 11)
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}        # PLACEHOLDER secret
      - name: Resolve product token (from tag on tag-push)
        id: tag
        if: startsWith(github.ref, 'refs/tags/')
        run: echo "product=${GITHUB_REF_NAME%%-app-v*}" >> "$GITHUB_OUTPUT"
      - name: EAS build
        # dispatch input wins; on a tag push, parse `<product>` from the `<product>-app-v*` tag.
        # `template` maps to the on-disk `_template` dir (the literal product token vs path).
        working-directory: products/${{ (github.event.inputs.product || steps.tag.outputs.product) == 'template' && '_template' || (github.event.inputs.product || steps.tag.outputs.product) }}/app
        run: eas build --non-interactive --profile "${{ github.event.inputs.profile || 'production' }}"
```
> **eas-cli workspace-detection workaround (gotcha):** the build relies on the committed
> hoisted node-linker (`nodeLinker: hoisted` in `pnpm-workspace.yaml` — pnpm 11 relocates this
> out of `.npmrc`; the `.npmrc` form is still honoured but the canonical home is the workspace
> yaml) AND a `"packageManager": "pnpm@11.x"` field in the **root** `package.json` (match the
> exact pnpm version mise pins) — without both, `eas build` misdetects the package manager in
> a pnpm workspace. RESOLVED (tag→product parse): the `tag` step derives `<product>` from the
> `<product>-app-v*` tag via bash parameter expansion `${GITHUB_REF_NAME%%-app-v*}` and
> exposes it as `steps.tag.outputs.product`; the `working-directory` then maps the literal
> `template` token to the on-disk `_template` dir (same expression the matrix workflows use).

**Commands** — manual: Actions → "EAS Build" → run with `product`+`profile`. Store build:
`git tag template-app-v1.0.0 && git push origin template-app-v1.0.0`.

**Why** — PHILOSOPHY.md: "eas-build.yml — dispatch/tag; needs `EXPO_TOKEN`, committed `.npmrc`,
`packageManager` field in root package.json (eas-cli workspace detection workaround). Store
builds only for native changes."

#### `eas-update.yml`

**Files** — `.github/workflows/eas-update.yml`

**Contents**
```yaml
name: EAS Update (OTA)
on:
  push:
    branches: [main]                    # JS-only OTA → staging channel
    tags: ["*-ota-v*"]                  # <product>-ota-v* → production channel
jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      products: ${{ steps.filter.outputs.changes }}
    steps:
      - uses: actions/checkout@v6
      - uses: dorny/paths-filter@v4
        id: filter
        with:
          filters: |
            template: ['products/_template/app/**', 'packages/**']
            demo: ['products/demo/app/**', 'packages/**']
  update:
    needs: changes
    if: ${{ needs.changes.outputs.products != '[]' }}
    runs-on: ubuntu-latest
    strategy:
      matrix:
        product: ${{ fromJSON(needs.changes.outputs.products) }}
    steps:
      - uses: actions/checkout@v6
      - uses: jdx/mise-action@v4
      - run: pnpm install --frozen-lockfile
      - uses: expo/expo-github-action@v8
        with: { eas-version: latest, token: ${{ secrets.EXPO_TOKEN }} }
      - name: OTA (staging on main, production on tag)
        working-directory: products/${{ matrix.product == 'template' && '_template' || matrix.product }}/app
        run: |
          if [[ "${GITHUB_REF}" == refs/tags/* ]]; then
            eas update --channel production --non-interactive --auto
          else
            eas update --channel staging --non-interactive --auto
          fi
```
> **OTA delivery prerequisite (cross-reference Phase 2 `app.config.ts`):** `eas update
> --channel` only reaches INSTALLED builds if `app.config.ts` sets `updates.url`
> (`https://u.expo.dev/<projectId>`) AND a `runtimeVersion` policy (e.g. `{ policy:
> "appVersion" }` or `"fingerprint"`). `extra.eas.projectId` alone does NOT deliver OTA —
> without `updates.url` + a matching `runtimeVersion`, this workflow publishes an update that
> no installed build ever fetches. `eas update:configure` populates both.

**Commands** — staging OTA is automatic on merge to `main`. Production OTA:
`git tag template-ota-v1.0.1 && git push origin template-ota-v1.0.1`.

**Why** — PHILOSOPHY.md: "eas-update.yml — OTA: on main push affecting a product's app → `eas
update --channel staging`; tag `<product>-ota-v*` → `--channel production`." Channels are
EXACTLY `staging` / `production`. Mobile = OTA for JS-only changes; native changes go through
`eas-build.yml`.

#### `e2e-nightly.yml`

**Files** — `.github/workflows/e2e-nightly.yml`

**Contents**
```yaml
name: E2E Nightly
on:
  schedule:
    - cron: "0 4 * * *"          # nightly 04:00 UTC
  workflow_dispatch: {}          # on-demand (the Verify path)
jobs:
  web-e2e:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: postgres }
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready" --health-interval 10s --health-timeout 5s --health-retries 5
    steps:
      - uses: actions/checkout@v6
      - uses: jdx/mise-action@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - name: Web E2E (signup → login → CRUD → realtime)
        run: pnpm --filter @platform/template-app exec playwright test
  visual-regression:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: jdx/mise-action@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - name: Build Storybook
        run: pnpm --filter @platform/ui storybook:build
      - name: Visual regression (each story × light/dark vs committed baselines)
        run: pnpm --filter @platform/ui exec playwright test
```
> Two independent jobs so a VR diff doesn't mask an E2E failure (and vice versa). VR baselines
> are committed; a diff fails the job and uploads the comparison (add an
> `actions/upload-artifact` step for the Playwright report when wiring CI for real).

**Commands** — Actions → "E2E Nightly" → **Run workflow** (`workflow_dispatch`).

**Why** — PHILOSOPHY.md: "e2e-nightly.yml — Playwright E2E + Storybook visual regression
(schedule)" and Testing strategy marks both **nightly + `workflow_dispatch`**.

#### `electron-release.yml`

**Files** — `.github/workflows/electron-release.yml`

**Contents**
```yaml
name: Electron Release
on:
  push:
    tags: ["*-desktop-v*"]       # <product>-desktop-v* → 3-OS matrix
jobs:
  release:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v6
      - uses: jdx/mise-action@v4
      - run: pnpm install --frozen-lockfile
      - name: Resolve product token (from the desktop tag)
        id: tag
        run: echo "product=${GITHUB_REF_NAME%%-desktop-v*}" >> "$GITHUB_OUTPUT"
      - name: Build the web bundle the desktop wraps
        run: pnpm turbo run export:web --filter=*-app
      # macOS: sign+publish only when certs are present; empty placeholders → build-but-don't-publish.
      - name: electron-builder — signed publish (mac when certs exist; win/linux always)
        if: runner.os != 'macOS' || env.MAC_CSC_LINK != ''
        working-directory: products/${{ steps.tag.outputs.product == 'template' && '_template' || steps.tag.outputs.product }}/desktop
        env:
          GH_TOKEN: ${{ secrets.DESKTOP_RELEASES_TOKEN }}   # PLACEHOLDER (token for <org>/<product>-desktop-releases)
          MAC_CSC_LINK: ${{ secrets.MAC_CSC_LINK }}          # PLACEHOLDER (empty until certs exist)
          CSC_LINK: ${{ secrets.MAC_CSC_LINK }}              # electron-builder reads CSC_LINK
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CSC_KEY_PASSWORD }}
        run: pnpm electron-builder --publish always
      - name: electron-builder — macOS build-only (no certs yet)
        if: runner.os == 'macOS' && env.MAC_CSC_LINK == ''
        working-directory: products/${{ steps.tag.outputs.product == 'template' && '_template' || steps.tag.outputs.product }}/desktop
        env:
          MAC_CSC_LINK: ${{ secrets.MAC_CSC_LINK }}
        run: pnpm electron-builder --mac --publish never   # builds unsigned; does NOT publish the mac artifact
```
> The tag must match `desktop/package.json` `version`. RESOLVED (tag→product parse): the `tag`
> step derives `<product>` from `${GITHUB_REF_NAME%%-desktop-v*}` (bash parameter expansion),
> mapping the literal `template` token to the on-disk `_template` dir. RESOLVED (macOS
> signing): the publish step is gated `if: runner.os != 'macOS' || env.MAC_CSC_LINK != ''` so
> win/linux always publish and macOS only publishes once `MAC_CSC_LINK`/`MAC_CSC_KEY_PASSWORD`
> certs exist; until then the macOS leg runs a `--publish never` build-only step (unsigned, no
> publish). Alternatively drop `macos-latest` from the matrix entirely. macOS auto-update
> requires a signed AND notarized app, so mac OTA stays inert until certs land.

**Commands** — `git tag template-desktop-v1.0.0 && git push origin template-desktop-v1.0.0`.

**Why** — PHILOSOPHY.md: "electron-release.yml — 3-OS matrix, `electron-builder --publish always`,
tag must match `desktop/package.json` version." Each product's desktop publishes to its own
`<org>/<product>-desktop-releases` repo (Key ruling #3 — avoids the electron-updater
"latest release of the repo" collision).

> **Note — web has NO workflow.** Vercel's git integration deploys each product's web app on
> push. There is deliberately no `web-deploy.yml`. For skipping unaffected monorepo builds,
> **`turbo-ignore` is now OPTIONAL**: Vercel ships a built-in **"Automatically skip
> unnecessary deployments in monorepos"** project setting (Turborepo-powered) that skips
> unchanged projects with NO manual ignored-build-step config — prefer enabling that. The
> per-product `npx turbo-ignore` "ignored build step" remains a valid manual alternative; if
> still invoked bare, pass **`--fallback=HEAD^`** (`npx turbo-ignore --fallback=HEAD^`) to
> avoid the new-branch "always deploys" gotcha (turbo-ignore otherwise compares against the
> last successful deployment on the branch, which doesn't exist on a branch's first commit).

---

### (g) Docs & agent surface — root + packages/ui + product

> PHILOSOPHY.md "Docs & agent surface": README + CLAUDE.md + `.claude/commands/` at THREE levels.
> Product-level docs are authored once in `_template` and **token-rewritten by the generator**
> (`new-product.mjs` step 3 covers product README/CLAUDE.md/`.claude/commands/*`; ports and
> infra names come from `product.json`).

#### Root

**Files** — `README.md`, `CLAUDE.md`, `.claude/commands/{new-product,affected,typegen,release,add-component,sync-tokens,bootstrap-design-system}.md`

**Contents** — root `CLAUDE.md` is the monorepo map + conventions + gotchas:
```markdown
# CLAUDE.md — platform monorepo

## Map
packages/{config,ui,core}; products/{_template,demo}/{app,desktop,api,api-client}.

## Conventions (locked)
- Promote-on-2nd-use: compositions start product-local; move into packages/* on 2nd use.
- Naming derives from the PRODUCT, never the repo: @platform/*, com.example.*,
  infra <org>-<product>-<env> (org placeholder `example`).
- Theming = semantic CSS variables. NEVER name a color in a component — tokens only.
- Figma modes ARE brand modes; theme.ts is the export of a Figma brand mode.
- Realtime is BROADCAST-ONLY. No Postgres-Changes, no RLS holes.
- Errors are RFC 9457 problem+json; the generated api-client is NEVER hand-edited.

## Gotchas
- pnpm hoisted linker (`nodeLinker: hoisted` in pnpm-workspace.yaml, pnpm 11); never set disableHierarchicalLookups.
- Supabase pooler 6543 = transaction-mode only (psycopg3, NullPool, prepare_threshold=None);
  Alembic migrates over direct 5432 (DATABASE_MIGRATION_URL).
- Sentry = @sentry/react-native (NOT sentry-expo).
- X-Request-Id: client → API → logs; same id tags Sentry on both sides.

## Commands
/new-product <name> · /affected · /typegen <product> · /release <product> <surface>
/add-component <name> · /sync-tokens · /bootstrap-design-system
```
Root `.claude/commands/` inventory (each a thin runnable recipe): `new-product.md`
(`node scripts/new-product.mjs $ARG`), `affected.md` (`turbo run lint typecheck test build
--affected`), `typegen.md` (`turbo run openapi build --filter=*$ARG-api-client`),
`release.md` (tag `<product>-<surface>-v*`, push), `add-component.md` (delegates to the
`packages/ui` recipe), `sync-tokens.md` (`node scripts/figma-tokens.mjs`),
`bootstrap-design-system.md` (the handover procedure: reconcile → tokens → components → verify).

> `/add-component`, `/sync-tokens`, `/bootstrap-design-system` operate on shared `packages/ui`
> (no product arg); the others take a product arg (PHILOSOPHY.md Docs & agent surface).

**The `ptfm-*` agentic development pipeline (also root `.claude/commands/`).** Alongside the
thin wrappers above, the root command surface includes the opinionated lifecycle pipeline that
is the **primary way products are built**: `ptfm-product` → `ptfm-architect` → `ptfm-plan` →
`ptfm-implement` → `ptfm-audit` → `ptfm-simplify` → `ptfm-commonify` → `ptfm-review` →
`ptfm-test-ui`. Each takes the **product name as its first arg** and writes its artifact to that
product's own docs tree: `products/<product>/docs/{product,architecture,plans,implementation,
reviews}/` (created on first write — no pre-seeding; the *product* already exists via
`new-product`). These commands encode PHILOSOPHY.md's invariants as executable flows; they are
already authored at `.claude/commands/ptfm-*.md` and **must NOT be deleted by the post-setup
cleanup** (they are runtime, not build scaffolding).

**Step — wire the agentic tooling (do this as part of the agent-surface build).** For the
`ptfm-*` pipeline to work, the implementing agent must:
1. Keep the `ptfm-*.md` command files in `.claude/commands/` (they ship with the repo).
2. Document the **operational stack** (the MCP integrations the pipeline drives) in the root
   `README.md` and root `CLAUDE.md`: **Linear** (`mcp__Linear__*`), **Notion**
   (`mcp__Notion__*`), **Figma** (`mcp__Figma__*`), **Supabase** (`mcp__Supabase__*`,
   read-only introspection — migrations go via Alembic), **Playwright** (`mcp__playwright__*`),
   **GitHub** (`mcp__github__*`) — and that a developer must connect them in Claude Code before
   running the pipeline.
3. State in each product's `CLAUDE.md` that the per-product `docs/{product,architecture,plans,
   implementation,reviews}/` tree is where the pipeline's artifacts live, and that the pipeline
   is the canonical build workflow for that product.

Root `README.md` = human quickstart: `mise install && pnpm install && pnpm bootstrap`; where
components live; `pnpm --filter @platform/ui storybook`; `pnpm new-product <name>`; points at
`CLAUDE.md` for authoritative recipes (does not duplicate them). Retain a short **post-setup
cleanup** note: the build scaffolding (`.claude/commands/implement.md` + `docs/phase-*.md`,
optionally `docs/research/`) is safe to delete once the template is built — it has no runtime
role; keep `PHILOSOPHY.md` + the `CLAUDE.md` surface + `scripts/`.

#### packages/ui

**Files** — `packages/ui/CLAUDE.md`, `packages/ui/FIGMA.md`,
`packages/ui/.claude/commands/{add-component,sync-tokens,bootstrap-design-system}.md`

**Contents** — `packages/ui/CLAUDE.md` is the design-system runbook (symmetric to the api
CLAUDE.md). The **add-a-component recipe** (enforced verbatim):
```markdown
# CLAUDE.md — @platform/ui design system

## add-a-component recipe (run via /add-component)
1. cli-add (react-native-reusables CLI) OR author the component into
   src/components/ui/<name>.tsx — OWNED source (shadcn model), tokens-only.
2. Pin @rn-primitives/* deps EXACT (pre-1.0).
3. Write <name>.stories.tsx — ONE story per cva variant.
4. Write <name>.figma.tsx — Code Connect map (Figma props → cva variants).
5. Export from src/index.ts.
6. Commit the VR baseline (light + dark) — see e2e-nightly VR.

## Invariants
- Tokens ONLY. NEVER name a color (no hex, no brand values) — use bg-primary etc.
- Two-tier ownership: tier-1 owned primitives here; tier-2 compositions start
  product-local, promote here on 2nd use.
- theme.ts / global.css default light+dark are generated by /sync-tokens
  (figma-tokens.mjs) — NEVER hand-edit generated theme values.

## Storybook
pnpm --filter @platform/ui storybook — toolbar has light/dark + brand (template/demo).

## Figma
Code Connect maps are authored as *.figma.tsx and published via the Code Connect CLI.
See FIGMA.md for the designer-side library conventions. /bootstrap-design-system is the
handover-day import (reconcile → tokens → components → verify).
```
`packages/ui/FIGMA.md` (designer-facing — the single doc handed to design): Variables
structure (`primitives` raw scale + `semantic` collection), **modes = light/dark × brand
(template/demo)**, names-as-API, component anatomy must match the code, publish as a team
library (Foundations = Variables, Components = component sets). `.claude/commands/`:
`add-component.md` (the recipe above), `sync-tokens.md` (`node scripts/figma-tokens.mjs`),
`bootstrap-design-system.md`.

#### Product (`_template`, token-rewritten by the generator)

**Files** — `products/_template/README.md`, `products/_template/CLAUDE.md`,
`products/_template/api/.../CLAUDE.md` (nested api recipe),
`products/_template/.claude/commands/{dev,typegen,migrate,add-feature,release}.md`

**Contents** — product `CLAUDE.md`: product structure, **ports + infra names** (sourced from
`product.json` so they stay accurate after stamping), where compositions live
(`features/<x>/components/`) + the promote-on-2nd-use trigger, and that the product's
`theme.ts` is the export of its Figma brand mode. The **nested api `CLAUDE.md`** holds the
**add-an-endpoint-end-to-end recipe** (enforced verbatim):
```markdown
# CLAUDE.md — template api

## add-an-endpoint recipe
model (SQLModel, UUIDv7 base, RLS deny-all migration)
  → service (class per aggregate, holds the session via Depends, owns logic + data access)
  → schema (Pydantic v2 DTO — the ONLY thing crossing HTTP; ORM models never serialized)
  → router (thin; depends on the service; maps schema↔domain)
  → openapi (turbo run openapi) → typegen (turbo run build --filter=*api-client)
  → hook (generated TanStack hook) → screen (features/<x>)

## Rules
- Strict layered OOP, NO repository layer (services query directly).
- pyright strict + Pydantic strict — enforced in pre-push AND CI.
- RFC 9457 problem+json errors; cursor pagination (useInfiniteQuery-ready).
```
Product `.claude/commands/` (product-scoped, apply when a session opens in the product dir):
`dev.md` (`turbo run dev --filter=*<product>-*`), `typegen.md` (`turbo run openapi build
--filter=*<product>-api-client`), `migrate.md` (`uv run alembic …`), `add-feature.md`
(scaffold `features/<x>/`), `release.md` (tag `<product>-<surface>-v*`).
Product `README.md` = human quickstart (where components live, launch the workbench, sync
tokens) pointing at the CLAUDE.md for the recipe.

**Commands**
```bash
# verify the agent surface exists at all three levels:
ls CLAUDE.md README.md .claude/commands/
ls packages/ui/CLAUDE.md packages/ui/FIGMA.md packages/ui/.claude/commands/
ls products/_template/CLAUDE.md products/_template/README.md products/_template/.claude/commands/
```

**Why** — PHILOSOPHY.md Docs & agent surface (the long bullet + ruling): three-level docs, the
add-a-component recipe in `packages/ui/CLAUDE.md`, the add-an-endpoint recipe in the nested
api CLAUDE.md, FIGMA.md as the designer doc, root commands take a product arg except
`/add-component` `/sync-tokens` `/bootstrap-design-system`, product commands are
product-scoped and load from the session's project root.

---

## Gotchas & pitfalls

- **Affected-only caching proof.** `--affected` must rebuild ONLY touched products; touching
  `products/demo` must leave `template` a **cache hit**. This depends on correct turbo
  `inputs`/`outputs` (esp. the mandatory Python `inputs` globs from Phase 1) and on
  `fetch-depth: 0` in CI so Turbo can compute the base diff. If a shared `packages/*` is
  touched, **all dependents rebuild** (the co-evolve guard) — that is correct, not a cache
  miss bug.
- **Drift check is the contract guard.** `turbo run openapi build --filter=*api-client*`
  regenerates `openapi.json` + the client; `git diff --exit-code products/*/api-client
  products/*/api/openapi.json` must be clean. A model change without a regen → non-zero diff
  → CI red. Never hand-edit the generated client.
- **Broadcast-only — never Postgres-Changes.** The realtime path is service-role HTTP
  broadcast on a per-product channel; clients refetch through the API. Do NOT subscribe to
  Postgres-Changes and do NOT open RLS on any table to enable a subscription — tables stay
  deny-all and the schema stays private. Opening RLS "just to get realtime" is the mistake
  this pattern exists to prevent.
- **Expo Go can't receive push tokens.** `getExpoPushTokenAsync()` needs a **dev build**
  (custom dev client), not Expo Go, and a **real device** (not a simulator —
  `Device.isDevice` guards this). The full push loop is therefore **verified later on real
  devices**; CI verifies the server side (`send_push()` with a mocked httpx transport).
- **Sentry SDK is `@sentry/react-native`, NOT `sentry-expo`.** `sentry-expo` is deprecated;
  PHILOSOPHY.md locks `@sentry/react-native`. Using the wrong package is a silent footgun.
- **eas-cli workspace detection workaround.** In a pnpm workspace, `eas build`/`eas update`
  misdetect the package manager unless BOTH the committed hoisted node-linker
  (`nodeLinker: hoisted` in `pnpm-workspace.yaml` — pnpm 11's home for it; the old `.npmrc`
  `node-linker` key is silently ignored on pnpm 11) and a `"packageManager": "pnpm@11.x"` field in the
  **root** `package.json` are present.
  Both must ship.
- **Web has NO workflow.** Do not add a `web-deploy.yml`. Vercel git integration handles web;
  adding a workflow would double-deploy. Skip-unaffected is now Vercel's built-in
  "Automatically skip unnecessary deployments in monorepos" setting (preferred) — `npx
  turbo-ignore` as the manual "ignored build step" is OPTIONAL now, and if invoked bare must
  pass `--fallback=HEAD^` to avoid the new-branch always-deploy gotcha.
- **macOS desktop signing gating.** `electron-builder --publish always` only signs/notarizes
  macOS once certs exist. The workflow gates the publish step `if: runner.os != 'macOS' ||
  env.MAC_CSC_LINK != ''` (win/linux always publish; macOS publishes only when the cert
  secret is set) and falls back to an unsigned `--mac --publish never` build-only step when
  certs are absent. Alternatively drop `macos-latest` from the matrix. Auto-update on macOS
  requires signing AND notarization (PHILOSOPHY.md Electron essentials).
- **Request-id middleware ordering.** Register `RequestIdMiddleware` LAST (`add_middleware`
  adds outermost-last) so it wraps the security middleware and error handlers — otherwise
  error responses won't carry the `X-Request-Id` header and error logs lose the id.
- **All repo/org values are placeholders.** `example`, `com.example.*`, `TODO-EAS-PROJECT-ID`,
  `<org>/<product>-desktop-releases`, every `secrets.*`, and Fly app names
  (`example-template-api-stg|prod`) are clearly-marked swap-points for real-infra day. A
  `git grep -inE 'example|TODO'` should surface exactly these and nothing else. (The former
  `PARSE-FROM-TAG` placeholders in `eas-build.yml`/`electron-release.yml` are now resolved to
  real `${GITHUB_REF_NAME%%-<surface>-v*}` parse steps.)

---

## Verification

Maps 1:1 to the Phase 8 Verify row.

1. **Push branch → CI green.**
   ```bash
   git switch -c phase-8-cicd
   git push -u origin phase-8-cicd
   # GitHub → Actions → "CI" run is green (lint/typecheck/test/build/openapi + drift)
   ```
2. **Touch one product → other is cache-hit.**
   ```bash
   # touch demo only:
   echo "" >> products/demo/api/src/demo_api/main.py
   pnpm turbo run build --affected
   # turbo summary: demo tasks EXECUTED, template tasks "cache hit, replaying logs"
   ```
3. **Stale `openapi.json` fails drift check.**
   ```bash
   # change a response model WITHOUT regenerating:
   # (edit a schemas/*.py field) then:
   git diff --exit-code products/*/api-client products/*/api/openapi.json   # → non-zero (fails)
   # fix: turbo run openapi build --filter=*template-api-client && git add -A
   ```
4. **Items list refreshes across two open clients after a mutation.**
   ```bash
   pnpm bootstrap                                  # supabase local + API + app
   pnpm --filter @platform/template-app exec playwright test e2e/items.spec.ts
   # the "broadcast item" assertion on the second context passing IS this proof.
   # Manual: open localhost:8081 in two tabs, add an item in one → the other refreshes.
   ```
5. **API log lines carry the `request_id`.**
   ```bash
   curl -s -H "X-Request-Id: test-rid-123" http://localhost:8000/v1/hello
   # API stdout shows a JSON line: {"event":"http_request",...,"request_id":"test-rid-123"}
   # and the response carries `X-Request-Id: test-rid-123` (curl -i to see it).
   ```
6. **`e2e-nightly.yml` green via `workflow_dispatch` (E2E + visual regression).**
   ```bash
   # GitHub → Actions → "E2E Nightly" → Run workflow (branch: main)
   # both jobs (web-e2e, visual-regression) green.
   # Locally: pnpm --filter @platform/ui storybook:build &&
   #          pnpm --filter @platform/ui exec playwright test   # VR vs baselines
   ```
7. **Scheduled task runs via `fly machine run`.**
   ```bash
   fly machine run --app example-template-api-stg \
     registry.fly.io/example-template-api-stg:latest \
     python -m template_api.tasks prune-push-tokens
   # Fly logs show the JSON line {"event":"pruned_push_tokens","count":N}
   ```

---

## Commits

Logical commits on the `phase-8-cicd` branch (PHILOSOPHY.md: each phase = one or a few logical
commits):

1. `feat(obs): request_id middleware + structlog JSON + Sentry both sides + X-Request-Id` —
   step (a).
2. `feat(push): push-token model/router/service + send_push (httpx) + core registration` —
   step (b).
3. `feat(realtime): broadcast-only invalidation (api broadcast + core subscribe-and-invalidate)` —
   step (c).
4. `feat(api): scheduled tasks.py prune-push-tokens + Fly machine docs` — step (d).
5. `test(e2e): Playwright web E2E + Storybook VR baselines + Maestro flow` — step (e).
6. `ci: ci/deploy-api/eas-build/eas-update/e2e-nightly/electron-release workflows` — step (f).
7. `docs: root + packages/ui + product CLAUDE.md/README/.claude commands` — step (g).

(Commit/branch/push only when the user asks; do not run git as part of writing this guide.)

---

## Open questions / deferred

- ⚠️ **OPEN / TO CONFIRM — broadcast failure policy:** whether a Supabase broadcast failure
  should fail the mutation. Default here: log + swallow (writes never blocked by a Realtime
  outage). Confirm per product.
- ⚠️ **OPEN / TO CONFIRM — "stale" push-token definition:** PHILOSOPHY.md says "prune stale push
  tokens" without a threshold. Default: 90 days by `updated_at`. Needs an `updated_at` column
  on the token (base model or the table).
- ⚠️ **OPEN / TO CONFIRM — E2E process orchestration:** the exact background-API start +
  teardown glue in `global-setup.ts`/`globalTeardown` is not pinned by PHILOSOPHY.md.
- **RESOLVED — `--affected` base ref in CI:** with `fetch-depth: 0` Turbo auto-detects the
  base (PR base ref / previous push commit); `ci.yml` also sets `TURBO_SCM_BASE`/`TURBO_SCM_HEAD`
  explicitly to be robust against squash-merge histories. Revisit only if CI mis-scopes.
- **RESOLVED — tag→product parsing:** `eas-build.yml` and `electron-release.yml` now derive
  `<product>` from the tag via a step (`echo "product=${GITHUB_REF_NAME%%-<surface>-v*}" >>
  "$GITHUB_OUTPUT"`) and map the literal `template` token to the `_template` dir — no more
  `PARSE-FROM-TAG` placeholder.
- **RESOLVED — macOS signing:** `electron-release.yml` gates the signed publish step with
  `if: runner.os != 'macOS' || env.MAC_CSC_LINK != ''` (win/linux always publish; macOS only
  when certs exist) and runs an unsigned `--publish never` build-only step otherwise. mac
  auto-update stays inert until the app is signed AND notarized.
- **Deferred (PHILOSOPHY.md):** Maestro CI via EAS Workflows (local-only for now); Chromatic
  (declined — self-hosted Playwright VR); ADR-vs-ARCHITECTURE.md decision-record format.
