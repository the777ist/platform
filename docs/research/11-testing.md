# Testing — accuracy review (June 2026)

## Summary

**Checked: 18 claims** across the Testing strategy table, Phase 2 (Jest + RNTL), Phase 3
(pytest + httpx + SQLAlchemy + polyfactory), and Phase 8 (Playwright web/VR, Maestro).

- ✅ Accurate / current: **11**
- ⚠️ Needs a change / caveat: **5**
- ❌ Wrong as written (will break at execution): **2**
- ❓ Unverifiable from PHILOSOPHY/guides alone: **0** (all resolved against docs)

**Headline:** The testing toolchain is fundamentally sound and current — **jest-expo is
still Expo's recommended unit runner and version 56.0.4 supports SDK 56 / RN 0.85**, RNTL is
current, Playwright/Maestro/polyfactory/pytest are all current. But **two example code
blocks are now broken by 2026 breaking changes**: (1) the Phase 2 Button test uses the
**synchronous** RNTL API, which **RNTL v14.0.0 (June 2026) made async** — `render`,
`fireEvent`, `renderHook` now return Promises and MUST be awaited; (2) the Phase 3 per-test
rollback fixture is **silently non-isolating under SQLAlchemy 2.0** because services call
`session.commit()` and the fixture does not set `join_transaction_mode="create_savepoint"`.
Both are mechanical fixes. Two further ⚠️ items: the `@testing-library/jest-native` mention
is a deprecated package (built-in matchers replace it), and the Phase 3 guide's "pytest +
httpx" integration row actually uses FastAPI's **sync `TestClient`**, not the
`httpx.AsyncClient` + `ASGITransport` pattern the prompt asked to confirm — fine, but worth
flagging since the table header says "httpx".

**Verdict: SHIP WITH FIXES.** No tool choice needs replacing; fix the two ❌ code blocks and
the two ⚠️ matcher/transport notes before the harness is authored, then it is correct.

---

## Findings

### 1. jest-expo as the single JS runner for SDK 56 / RN 0.85
- **Location:** PHILOSOPHY.md "Quality" bullet + Testing strategy row 1; Phase 2 step (i)
  (`preset: "jest-expo"`); Phase 2 Gotchas (NativeWind v4 ↔ SDK 56).
- **Claim:** "single Jest runner (jest-expo preset) + RNTL for ALL JS tests"; viable on
  Expo SDK 56 / RN 0.85.
- **Status:** ✅
- **Finding:** Current. `jest-expo` is published at **56.0.4**, aligned to SDK 56, and Expo's
  unit-testing docs still recommend `jest-expo` (specifically `jest-expo/universal` for the
  multi-platform iOS/Android/web/Node run). RN 0.85 extracted its preset into a new
  `@react-native/jest-preset` package, but that is an internal refactor — `jest-expo`
  consumes it; it does **not** replace `jest-expo` for Expo apps. Install via
  `npx expo install jest-expo jest` (the guide's `pnpm dlx`/devDep approach is equivalent;
  prefer `expo install` so the version matches the SDK, which the guide already says for
  other Expo packages). Expo has **not** moved to Vitest or another runner for RN unit tests.
- **Recommended change:** None required. Optionally pin `jest-expo@56.x` exact (per the
  repo's pin-fast-movers discipline) and note `jest-expo/universal` if multi-platform
  snapshotting is wanted.
- **Source(s):** npmjs.com/package/jest-expo; docs.expo.dev/develop/unit-testing;
  reactnative.dev/blog/2026/04/07/react-native-0.85.

### 2. RNTL example test uses the synchronous API — broken under RNTL v14
- **Location:** Phase 2 step (i), `packages/ui/src/components/ui/__tests__/button.test.tsx`.
- **Claim:** `render(<Button>…</Button>)` then `fireEvent.press(screen.getByText("Tap"))`
  synchronously, with `expect(...).toHaveBeenCalledTimes(1)`.
- **Status:** ❌
- **Finding:** **React Native Testing Library v14.0.0 (released 2026-06-05) made the core
  APIs async** to support React 19's async rendering. `render()` now returns
  `Promise<RenderResult>`, `renderHook()` returns `Promise<RenderHookResult>`, and
  `fireEvent()` / its helpers return `Promise<void>` — all must be `await`ed. v14 requires
  React 19.0.0+ and RN 0.78+ (so it is compatible with SDK 56's React 19.2 / RN 0.85). The
  guide's synchronous example will not work against v14: the `screen` queries run before the
  render Promise resolves, and the press is not awaited.
- **Recommended change:** Make the tests async and await render/fireEvent:
  ```tsx
  it("renders its label", async () => {
    await render(<Button>Press me</Button>);
    expect(screen.getByText("Press me")).toBeOnTheScreen();
  });
  it("fires onPress", async () => {
    const onPress = jest.fn();
    await render(<Button onPress={onPress}>Tap</Button>);
    await fireEvent.press(screen.getByText("Tap"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
  ```
  (If the team chooses to **pin RNTL to v13.x**, the existing sync example is valid — but v13
  does not support React 19 async rendering, so v14 is the correct target for SDK 56. Pin
  `@testing-library/react-native@14.x` exact.)
- **Source(s):** github.com/callstack/react-native-testing-library/releases (v14.0.0);
  npmjs.com/package/@testing-library/react-native; callstack.com/blog/react-native-testing-library-2-0.

### 3. `@testing-library/jest-native` is deprecated; matchers are built in
- **Location:** Phase 2 step (i): `jest.setup.ts` does
  `import "@testing-library/react-native/extend-expect";`; devDeps list names
  `@testing-library/jest-native` (with an "or the built-in `extend-expect`" hedge).
- **Claim:** Add `@testing-library/jest-native` as a devDep (or use built-in extend-expect).
- **Status:** ⚠️
- **Finding:** `@testing-library/jest-native` is **deprecated and unmaintained**; the
  official guidance is to migrate to RNTL ≥ v12.4, which ships the same matchers **built in**.
  Two correct things in the guide: the `extend-expect` import is a valid (still-supported) way
  to register matchers, and `toBeOnTheScreen` IS a real built-in matcher (added with the
  built-in matcher set). What is wrong is keeping `@testing-library/jest-native` in the
  devDeps list — on RNTL v14 it is unnecessary and deprecated. Also note: built-in matchers
  are available **automatically** once any import from `@testing-library/react-native` occurs
  in a test, so even the `extend-expect` setup line is technically optional (it's still fine
  to keep it for explicitness / TS types).
- **Recommended change:** Drop `@testing-library/jest-native` from the devDeps entirely. Keep
  `jest.setup.ts` as-is (the `extend-expect` import is harmless and documents intent), or
  remove it since matchers auto-register. Do not install the deprecated package.
- **Source(s):** testing-library.com/docs/ecosystem-jest-native (deprecation notice);
  github.com/testing-library/jest-native; npmjs.com/package/@testing-library/react-native/v/12.4.4.

### 4. RNTL version compatibility with SDK 56 stack
- **Location:** Phase 2 step (i) devDeps (`@testing-library/react-native`,
  `react-test-renderer` "pinned to the React version").
- **Claim:** RNTL + react-test-renderer pinned to React.
- **Status:** ⚠️
- **Finding:** RNTL **v14** dropped `react-test-renderer` as a peer in favor of React 19's
  built-in test rendering path, and `react-test-renderer` itself is **deprecated** as of React
  19. Pinning `react-test-renderer` may be unnecessary (and installing it on React 19 can
  cause version-conflict noise). Verify whether RNTL v14 still needs it at install time; the
  guide's blanket "pin react-test-renderer to the React version" is stale advice from the
  v12/v13 era.
- **Recommended change:** Install `@testing-library/react-native@14.x` and let it pull (or
  not pull) its own renderer dependency; only add `react-test-renderer` if RNTL v14's peer
  deps explicitly require it. Confirm against the v14 install docs at execution time.
- **Source(s):** npmjs.com/package/react-test-renderer (deprecated);
  github.com/callstack/react-native-testing-library/releases (v14 dropped RN 18 / renderer changes).

### 5. Frontend tests mock at the generated-client boundary
- **Location:** PHILOSOPHY.md mocking conventions ("frontend tests mock at the generated-client
  boundary (never fetch)").
- **Claim:** Mock the hey-api generated client, not `fetch`.
- **Status:** ✅
- **Finding:** Sound and tool-agnostic; consistent with hey-api's `@hey-api/client-fetch`
  surface (mock the exported SDK functions / client instance). No version dependency. The
  Phase 2 Button test is pure-UI and correctly doesn't touch this.
- **Recommended change:** None.
- **Source(s):** (architecture convention; no external doc needed.)

### 6. pytest + httpx "against real Postgres" — actually uses sync `TestClient`
- **Location:** Testing strategy row 3 header ("pytest + httpx against real Postgres");
  Phase 3 Step 23/24 `conftest.py` + `test_items.py` use
  `from fastapi.testclient import TestClient`.
- **Claim:** Integration via "pytest + httpx".
- **Status:** ⚠️
- **Finding:** FastAPI's `TestClient` IS built on httpx (it's an httpx `Client` with a
  `WSGI`/ASGI transport under the hood), so the row header isn't false — but the guide's
  integration tests are **synchronous** and never construct an `httpx.AsyncClient` /
  `ASGITransport`. The prompt asked specifically to verify that the **`app=` shortcut is gone
  and `ASGITransport(app=app)` is the current pattern** — that is correct and current
  (deprecated since httpx 0.27.0, 2024; current httpx is 0.28.x, still 0.x, no 1.0), and
  FastAPI's "Async Tests" docs use exactly
  `AsyncClient(transport=ASGITransport(app=app), base_url="http://test")`. **The guide does
  not use `app=` anywhere** (it uses `TestClient(app)`, which is the supported constructor and
  unaffected by the deprecation), so there is no bug — but the only async route exercised
  (`PushService.send_push`) is tested by **calling the service coroutine directly** under
  `@pytest.mark.asyncio`, not through an HTTP client. That's fine, but if any future test
  wants to hit an `async def` router over HTTP, it must use `httpx.AsyncClient` +
  `ASGITransport(app=app)`, never `AsyncClient(app=app)`.
- **Recommended change:** No fix needed for the shipped tests. Add a one-line note in the api
  CLAUDE.md/test conventions: "HTTP-level async tests use
  `httpx.AsyncClient(transport=ASGITransport(app=app))` — the `app=` shortcut was removed."
  Also pin `pytest-asyncio` (current **1.4.0**) and set `asyncio_mode = "auto"` or keep the
  explicit `@pytest.mark.asyncio` markers (the guide uses markers — valid; with
  pytest-asyncio ≥ 1.0 ensure `asyncio_mode` is configured in `pyproject.toml`).
- **Source(s):** fastapi.tiangolo.com/advanced/async-tests; github.com/encode/httpx
  discussions/3114 & issues/3111; pypi.org/project/pytest-asyncio (1.4.0); pypi.org/project/httpx (0.28.x).

### 7. Per-test transaction rollback fixture — non-isolating under SQLAlchemy 2.0
- **Location:** Phase 3 Step 23 `conftest.py` `session` fixture (connection + outer
  `trans = connection.begin()`, `Session(bind=connection)`, `trans.rollback()` at teardown);
  services call `self.session.commit()` (Step 7 `ItemService`).
- **Claim:** "per-test transaction rollback … so each test sees a clean DB. Never mock the
  session."
- **Status:** ❌
- **Finding:** This is the classic SQLAlchemy 1.x "join an external transaction" pattern, and
  **it is broken by SQLAlchemy 2.0 semantics.** In 2.0, `Session.commit()` commits the
  **outermost** transaction — so when `ItemService.create()` calls `self.session.commit()`,
  it commits the outer `trans` that the fixture intended to roll back. The teardown
  `trans.rollback()` then has nothing to undo, and **rows persist across tests** (e.g.
  `test_list_is_cursor_paginated` creating 25 items will pollute later tests; the cursor/count
  assertions can pass once then fail on re-run, or accumulate). The modern, correct pattern is
  to bind the Session with **`join_transaction_mode="create_savepoint"`** so that
  application-level `commit()` calls land on a SAVEPOINT inside the outer transaction, and the
  outer rollback discards everything. SQLModel's own discussions and the SQLAlchemy 2.0/2.1
  "Joining a Session into an External Transaction" docs prescribe this.
- **Recommended change:** Bind the session with `join_transaction_mode`:
  ```python
  @pytest.fixture
  def session(engine: Engine) -> Generator[Session, None, None]:
      connection = engine.connect()
      trans = connection.begin()
      with Session(bind=connection, join_transaction_mode="create_savepoint") as s:
          yield s
      trans.rollback()
      connection.close()
  ```
  (`Session` is SQLModel's, which subclasses SQLAlchemy's and accepts the kwarg.) Alternatively
  use the documented `begin_nested()` + `after_transaction_end` event-listener restart loop.
  Without one of these, the "per-test rollback" claim is false.
- **Source(s):** docs.sqlalchemy.org/en/20/orm/session_transaction.html (Joining a Session
  into an External Transaction; "Calling Session.commit() … always commits the outermost
  transaction"); github.com/sqlalchemy/sqlalchemy/discussions/7752 & 11658;
  github.com/tiangolo/sqlmodel/discussions/940.

### 8. polyfactory for Pydantic v2 / SQLModel factories
- **Location:** Testing strategy + Phase 3 Step 23 `factories.py`
  (`from polyfactory.factories.pydantic_factory import ModelFactory`,
  `class ItemCreateFactory(ModelFactory[ItemCreate]): __model__ = ItemCreate`).
- **Claim:** polyfactory `ModelFactory` over Pydantic v2 DTOs.
- **Status:** ✅
- **Finding:** Current and correct. polyfactory (Litestar org, actively maintained) supports
  Pydantic v2; `polyfactory.factories.pydantic_factory.ModelFactory` is the right import and
  `__model__ = …` is the right declaration. The guide factories target the **DTOs**
  (`ItemCreate`, `PushTokenCreate`) — which is the right call: polyfactory's `ModelFactory` is
  for Pydantic models, not SQLModel **table** classes directly (SQLModel tables are also
  Pydantic models but generating them needs DB-managed fields handled; building DTOs and
  letting the service persist is cleaner). PHILOSOPHY's phrase "Pydantic/SQLModel factories" is
  satisfied by factoring the DTOs.
- **Recommended change:** Pin polyfactory exact (current 2.x line). If a factory ever targets
  a SQLModel **table** class, use `SQLAlchemyFactory`/`ModelFactory` with care around the
  UUIDv7 PK + server-default timestamps (let them default; don't let the factory invent them).
- **Source(s):** github.com/litestar-org/polyfactory; pypi.org/project/polyfactory;
  polyfactory.litestar.dev/latest/reference/factories/pydantic_factory.html.

### 9. send_push() unit test with httpx MockTransport
- **Location:** PHILOSOPHY mocking conventions; Phase 8 step (b) `test_push.py`
  (`httpx.MockTransport(handler)`, inject `http=` AsyncClient).
- **Claim:** Mock external HTTP (Expo Push) via httpx mock transport.
- **Status:** ✅
- **Finding:** Correct and current. `httpx.MockTransport(handler)` wrapped in
  `httpx.AsyncClient(transport=transport)` is the supported way to stub outbound HTTP, and the
  dependency-injected `http=` client makes `send_push()` testable. Marker `@pytest.mark.asyncio`
  is correct for pytest-asyncio. The Phase 3 `send_push` variant constructs its own client
  (`async with httpx.AsyncClient(...)`) and is harder to mock — the Phase 8 injectable version
  supersedes it; ensure the Phase 8 signature (the `http=` param) is what ships.
- **Recommended change:** Make the Phase 3 `send_push` carry the injectable `http=` param from
  the start (align with Phase 8) so the unit test can mock it without monkeypatching.
- **Source(s):** python-httpx.org (MockTransport); fastapi.tiangolo.com/advanced/async-tests.

### 10. Playwright web E2E against exported SPA dist
- **Location:** Testing strategy row "Web E2E"; Phase 8 step (e) `playwright.config.ts`
  (`webServer: npx serve dist -l 8081`).
- **Claim:** Playwright drives the exported `dist/` SPA + local API + Supabase.
- **Status:** ✅
- **Finding:** Current and idiomatic. `@playwright/test`'s `webServer` + `defineConfig` API is
  stable; serving the `expo export --platform web` SPA and driving it with `devices["Desktop
  Chrome"]` is correct. `playwright install --with-deps chromium` in CI is right. The
  `global-setup.ts` process-orchestration gap is already flagged as OPEN in the guide
  (resolved below).
- **Recommended change:** Pin `@playwright/test` and run `playwright install` matching that
  pin in CI (version skew between the package and the installed browsers is the usual failure).
- **Source(s):** playwright.dev/docs/test-snapshots; playwright.dev/docs/release-notes.

### 11. Playwright `toHaveScreenshot` Storybook visual regression
- **Location:** Design system workbench bullet; Testing strategy "Visual regression"; Phase 8
  step (e) `visual-regression.spec.ts` (iterate `storybook-static/index.json`, visit
  `iframe.html?id=<story>&globals=theme:<theme>`, `toHaveScreenshot(...)`).
- **Claim:** Playwright screenshots of the static Storybook build, story × {light,dark},
  committed baselines.
- **Status:** ✅
- **Finding:** Correct and current. `toHaveScreenshot()` is the right Playwright VR matcher;
  visiting `iframe.html?id=<storyId>` is the documented Storybook-VR approach; passing
  Storybook globals via the `&globals=theme:dark` query string is supported by Storybook's
  iframe and matches the plan's toolbar `globalTypes`. Iterating `index.json` `entries` and
  filtering `type === "story"` is the current Storybook index format. Recommend setting
  `animations: "disabled"` and a small `maxDiffPixels`/`maxDiffPixelRatio` default in the VR
  config to reduce flake (CSS-Tricks/Playwright VR guidance).
- **Recommended change:** Add `toHaveScreenshot` defaults (`animations: "disabled"`,
  `maxDiffPixelRatio`) to `packages/ui/playwright.config.ts`; otherwise CI baseline diffs flake
  on font/AA rendering. Consider running VR in a pinned container so baselines match CI's
  rendering (the usual self-hosted-VR gotcha).
- **Source(s):** playwright.dev/docs/test-snapshots; medium.com/quality-is-everything
  (Playwright + Storybook VR); markus.oberlehner.net (free Storybook+Playwright VR).

### 12. Maestro mobile E2E flow YAML — `appId` with a bundle id
- **Location:** Testing strategy "Mobile E2E"; Phase 8 step (e) `.maestro/login.yaml`
  (`appId: com.example.template`, `launchApp`, `tapOn`, `inputText`, `assertVisible`).
- **Claim:** Maestro local-only flow.
- **Status:** ✅
- **Finding:** Current and valid. `appId:` + the `launchApp`/`tapOn`/`inputText`/`assertVisible`
  command set is the standard Maestro flow shape; using the app **bundle id**
  (`com.example.template`) in `appId` is correct for mobile. One 2026 change to be aware of:
  **URLs are no longer allowed in `appId`** (web flows must use the `url:` field) — irrelevant
  here since this is a native bundle id, but worth knowing if a web Maestro flow is ever added.
  Local-only (CI via EAS Workflows deferred) matches Maestro's positioning.
- **Recommended change:** None for the mobile flow. If a web flow is later added, use `url:`
  not `appId:`.
- **Source(s):** github.com/mobile-dev-inc/maestro; docs.expo.dev/eas/workflows/examples/e2e-tests;
  maestro.dev.

### 13. Desktop E2E — Playwright `_electron` only if shell logic grows
- **Location:** Testing strategy "Desktop" row; Key ruling #2/Phase 5 (launch smoke).
- **Claim:** No separate desktop E2E now; Playwright `_electron` reserved for later.
- **Status:** ✅
- **Finding:** Correct and current. Playwright's `_electron.launch()` / `ElectronApplication`
  class exists and is the right tool when desktop-shell logic (the `app://` protocol handler,
  updater) needs coverage. Deferring it is a reasonable scoping call; the API is "experimental"
  per Playwright docs but stable in practice and widely used (electron-playwright-helpers
  ecosystem). No accuracy problem.
- **Recommended change:** None. When adopted, add `electron-playwright-helpers` for
  artifact/IPC ergonomics.
- **Source(s):** playwright.dev/docs/api/class-electronapplication; playwright.dev/docs/api/class-electron;
  github.com/spaceagetv/electron-playwright-helpers.

### 14. CI Postgres service container for integration tests
- **Location:** Testing strategy row 3 ("postgres service container in CI"); Phase 8
  `ci.yml`/`e2e-nightly.yml` `services.postgres: image: postgres:16`.
- **Claim:** Real Postgres via a GH Actions service container.
- **Status:** ⚠️
- **Finding:** Mechanically correct (GH Actions `services:` with `postgres:16` + `pg_isready`
  health check is standard). Two caveats: (a) `postgres:16` is fine but **PG17/18 are GA in
  2026** and Supabase's managed Postgres version should be matched in CI so UUIDv7/SQL behavior
  is representative — Phase 3 itself flags "confirm the Supabase Postgres version" and notes
  PG18 has native `uuidv7()`. Align the CI image with the deployed Supabase major. (b) In
  Phase 8 `ci.yml` the `services:` block is placed at the **job** level but visually after
  `steps:` in the YAML — confirm it's a sibling key of `steps` (it is, in the snippet), and
  that tests read `TEST_DATABASE_URL` pointing at `localhost:5432` (the conftest default
  already does).
- **Recommended change:** Set the CI Postgres image to the same major as the Supabase project
  (likely 17; 18 if you want native `uuidv7()`), and resolve the Phase 3 UUIDv7-source OPEN in
  tandem (Python `uuid7` generator vs DB-side default) so tests and prod agree.
- **Source(s):** Phase 3 guide Step 1 OPEN note; docs.github.com Actions service containers
  (standard); (Supabase PG version — confirm in-project).

### 15. Contract drift check (regen openapi + client → git diff)
- **Location:** Testing strategy "Contract" row; Phase 8 `ci.yml` drift step.
- **Claim:** `git diff --exit-code` on regenerated `openapi.json` + client catches drift.
- **Status:** ✅
- **Finding:** Sound; not version-sensitive. The only testing-adjacent caveat: stable diffs
  require deterministic generation — the guide already does `sort_keys=True` in
  `export_openapi.py` (good) and pins `@hey-api/*` exact (good). Drift check is a CI step, not
  a test runner concern.
- **Recommended change:** None.
- **Source(s):** (architecture; covered by Phase 3/4 guides.)

### 16. `pytest` / strict-typing config currency
- **Location:** Phase 3 `pyproject.toml` (`[tool.pytest.ini_options]`, pytest + pytest-asyncio
  devDeps).
- **Claim:** pytest current; pytest-asyncio for async tests.
- **Status:** ✅
- **Finding:** pytest is at **9.0.3** (April 2026), pytest-asyncio at **1.4.0** (May 2026) —
  both current, both Python 3.10+ (3.13 fine). One actionable note: pytest-asyncio **1.x**
  defaults to `asyncio_mode = "strict"`, which requires the explicit `@pytest.mark.asyncio`
  markers the guide uses — so the markers are necessary, not optional, unless
  `asyncio_mode = "auto"` is set. The guide's `test_push.py` uses the marker correctly.
- **Recommended change:** Add `asyncio_mode = "strict"` (explicit) or `"auto"` under
  `[tool.pytest.ini_options]` so the behavior is pinned and not dependent on the default.
- **Source(s):** pypi.org/project/pytest (9.0.3); pypi.org/project/pytest-asyncio (1.4.0);
  pytest-asyncio.readthedocs.io changelog.

### 17. transformIgnorePatterns allowlist for jest-expo
- **Location:** Phase 2 step (i) `jest.config.js` `transformIgnorePatterns`.
- **Claim:** The regex allowlists RN/Expo/`@rn-primitives`/`nativewind`/
  `react-native-css-interop`/cva/`@platform/*` for transformation.
- **Status:** ⚠️
- **Finding:** Approach is correct (jest-expo ships a baseline `transformIgnorePatterns`; you
  must extend it for ESM-shipping deps), but **hand-maintaining the regex is fragile** and a
  common source of "SyntaxError: Cannot use import statement outside a module" once a new ESM
  dep lands. NativeWind's own Jest guidance and jest-expo both recommend extending the
  **preset's** array rather than replacing it, and the exact module list (esp.
  `react-native-css-interop` internals) changes across NativeWind/Expo versions.
- **Recommended change:** Build the pattern by extending jest-expo's default (e.g. spread the
  preset's `transformIgnorePatterns` and append the extra modules) rather than authoring a
  single literal regex, and re-verify it when the NativeWind v4↔SDK56 decision is settled
  (Phase 2 headline risk). Treat this as a settle-empirically item alongside that decision.
- **Source(s):** npmjs.com/package/jest-expo; nativewind.dev (Jest setup guidance — confirm at
  execution); docs.expo.dev/develop/unit-testing.

### 18. RNTL `screen` + `getByText`/`getByLabel`/`getByRole` query usage in E2E and unit
- **Location:** Phase 2 unit test (`screen.getByText`); Phase 8 Playwright specs
  (`getByLabel`, `getByRole`) — note: Playwright queries, not RNTL.
- **Claim:** Use semantic queries.
- **Status:** ✅
- **Finding:** RNTL `screen.getByText` is current. The Playwright `getByLabel`/`getByRole`
  calls in `items.spec.ts` are Playwright locators (web DOM) — correct and current; just
  ensure the exported RN-web SPA actually renders accessible labels/roles (RN `accessibilityLabel`
  → `aria-label` on web) so `getByLabel("Email")` resolves. That's a Phase 6 auth-screen
  authoring detail, not a tooling error.
- **Recommended change:** When authoring auth/home screens, set `accessibilityLabel`/roles so
  the Playwright semantic locators in the E2E spec resolve on react-native-web.
- **Source(s):** playwright.dev (locators); RNTL queries (oss.callstack.com/react-native-testing-library).

---

## Resolved OPEN / TO CONFIRM (in-scope items)

- **Is Jest still Expo's recommended unit runner / has Expo moved to another runner?**
  **Resolved: Jest (jest-expo) is still the recommended unit runner.** Expo's unit-testing
  docs recommend `jest-expo` (`jest-expo/universal` for multi-platform). RN 0.85 split out
  `@react-native/jest-preset` internally; `jest-expo@56.x` builds on it. No move to Vitest for
  RN units. (npmjs.com/package/jest-expo; docs.expo.dev/develop/unit-testing;
  reactnative.dev/blog/2026/04/07/react-native-0.85)

- **Does jest-expo support SDK 56 / RN 0.85?** **Resolved: Yes — jest-expo 56.0.4** is the
  SDK-56-aligned release; SDK 56 ships RN 0.85 + React 19.2. (npmjs.com/package/jest-expo;
  expo.dev/changelog/sdk-56)

- **RNTL matcher setup / `@testing-library/jest-native` status.** **Resolved:** jest-native is
  **deprecated**; matchers are **built into RNTL ≥ v12.4** and auto-register on any RNTL import.
  `import "@testing-library/react-native/extend-expect"` still works (optional). `toBeOnTheScreen`
  is a valid built-in matcher. **Do not** add `@testing-library/jest-native`. (See Finding 3.)
  Additionally: **RNTL v14 (current) made `render`/`fireEvent`/`renderHook` async** — the
  example test must `await` them (Finding 2).

- **httpx ASGI integration pattern (did httpx remove the `app=` shortcut?).** **Resolved:
  Yes — `AsyncClient(app=...)` was deprecated in httpx 0.27.0 and the supported pattern is
  `httpx.AsyncClient(transport=httpx.ASGITransport(app=app))`.** Current httpx is 0.28.x (still
  0.x; no 1.0 as of June 2026). The guide does **not** use `app=` (it uses sync `TestClient(app)`,
  which is unaffected), so there's no live bug — but document the ASGITransport pattern for any
  future HTTP-level async test. (fastapi.tiangolo.com/advanced/async-tests;
  github.com/encode/httpx issues/3111, discussions/3114)

- **Per-test transaction rollback pattern with SQLAlchemy 2.** **Resolved: the shipped fixture
  is wrong for SQLAlchemy 2.0** — because services `commit()`, the Session must be bound with
  `join_transaction_mode="create_savepoint"` (or use `begin_nested()` + an
  `after_transaction_end` restart listener), else commits escape the outer transaction and tests
  don't isolate. (Finding 7; docs.sqlalchemy.org/en/20/orm/session_transaction.html;
  github.com/tiangolo/sqlmodel/discussions/940)

- **Test schema build — `metadata.create_all` vs Alembic (Phase 3 OPEN).** **Resolved
  (recommendation):** `SQLModel.metadata.create_all(engine)` for the test DB is fine and faster
  than running Alembic per session, given the test role owns/bypasses RLS — **but** add one
  dedicated test that runs `alembic upgrade head` against the test URL and asserts RLS is
  enabled (`SELECT relrowsecurity FROM pg_class WHERE relname IN ('item','push_token')`), so the
  RLS-deny-all migration itself is covered. Otherwise `create_all` silently skips the RLS
  statements (they're raw `op.execute`, not in the metadata) and the migration's most important
  effect goes untested. (Phase 3 Step 23 OPEN; Phase 3 Step 20.)

- **E2E orchestration (Phase 8 `global-setup.ts` background API + teardown).** **Resolved
  (recommendation):** Use **two `webServer` entries** in `playwright.config.ts` — one for
  `npx serve dist` (the SPA) and one for the API (`uv run uvicorn … --port 8000`) — so
  Playwright manages start/readiness/teardown for both (each with its own `url:` health probe),
  and keep `global-setup.ts` only for the one-shot Supabase start + migrate + seed + export.
  Add a `globalTeardown` to `supabase stop`. This avoids hand-rolled background-process glue and
  is the documented Playwright multi-server pattern. (playwright.dev/docs/test-webserver;
  Phase 8 step (e) OPEN.)

---

## Sources

- https://www.npmjs.com/package/jest-expo
- https://docs.expo.dev/develop/unit-testing/
- https://expo.dev/changelog/sdk-56
- https://reactnative.dev/blog/2026/04/07/react-native-0.85
- https://github.com/callstack/react-native-testing-library/releases
- https://www.npmjs.com/package/@testing-library/react-native
- https://www.npmjs.com/package/@testing-library/react-native/v/12.4.4
- https://www.callstack.com/blog/react-native-testing-library-2-0
- https://testing-library.com/docs/ecosystem-jest-native/
- https://github.com/testing-library/jest-native
- https://www.npmjs.com/package/react-test-renderer
- https://oss.callstack.com/react-native-testing-library/docs/api/jest-matchers
- https://fastapi.tiangolo.com/advanced/async-tests/
- https://github.com/encode/httpx/issues/3111
- https://github.com/encode/httpx/discussions/3114
- https://pypi.org/project/httpx/
- https://pypi.org/project/pytest/
- https://pypi.org/project/pytest-asyncio/
- https://pytest-asyncio.readthedocs.io/en/stable/reference/changelog.html
- https://docs.sqlalchemy.org/en/20/orm/session_transaction.html
- https://docs.sqlalchemy.org/en/21/orm/session_transaction.html
- https://github.com/sqlalchemy/sqlalchemy/discussions/7752
- https://github.com/sqlalchemy/sqlalchemy/discussions/11658
- https://github.com/tiangolo/sqlmodel/discussions/940
- https://github.com/litestar-org/polyfactory
- https://pypi.org/project/polyfactory/
- https://polyfactory.litestar.dev/latest/reference/factories/pydantic_factory.html
- https://playwright.dev/docs/test-snapshots
- https://playwright.dev/docs/api/class-electronapplication
- https://playwright.dev/docs/api/class-electron
- https://playwright.dev/docs/release-notes
- https://playwright.dev/docs/test-webserver
- https://github.com/spaceagetv/electron-playwright-helpers
- https://medium.com/quality-is-everything/automated-visual-regression-testing-with-playwright-and-storybook-eab8f8cd6be1
- https://markus.oberlehner.net/blog/running-visual-regression-tests-with-storybook-and-playwright-for-free
- https://github.com/mobile-dev-inc/maestro
- https://docs.expo.dev/eas/workflows/examples/e2e-tests/
- https://maestro.dev/
