# Open items, review notes & fill-in markers — consolidated index

> **Auto-generated** from `PLAN.md` + `docs/phase-*.md` (regenerate after editing the
> guides). A navigational index into the guides — each entry is a `file:line` you can jump
> to, not a second source of truth. Three categories:
>
> 1. **⚠️ REVIEW / TO CONFIRM** — verify-at-the-keyboard items. `/implement` must resolve
>    each when it reaches it (run the install, check the tool/output) or STOP and ask.
>    Enumerated in full below.
> 2. **TODO-\* / PLACEHOLDER-\* tokens** — intentional fill-in slots in skeletons
>    (`TODO-EAS-PROJECT-ID`, `example` org, `PLACEHOLDER-pin-exact`, …). NOT open questions;
>    they're swap-points, and Phase 7 & 8 ship a `git grep` gate asserting exactly these
>    survive stamping. Counted, not enumerated.
> 3. **Deferred (by design)** — cross-phase handoffs owned by a later phase; they live in
>    each guide's `## Open questions / deferred` section and are picked up by the dependent
>    phase's `## Prerequisites`. Not gaps.
>
> **Resolved by user decision (2026-06-15):** Expo SDK strategy = start on 56, fall back to
> 54 only if NativeWind v4 is unworkable (settled empirically in Phase 2); UUIDv7 = app-side
> `uuid-utils` (PG-version-independent, not Postgres-native); brand rasterizer = `sharp`.
> *(Reach: "only the decisions I ask" — version pins, cross-phase reconciliations, and the
> proposed operational defaults (broadcast log+swallow, 90-day stale tokens, etc.) were left
> OPEN by choice and can be closed on request.)*

## 1. ⚠️ REVIEW / TO CONFIRM items (verify-or-ask)

### `docs/phase-1-root-tooling.md` (16)

- L23: ⚠️ OPEN / TO CONFIRM: PLAN.md does not pin an exact patch for `mise` itself, nor the host OS. Steps below assume a POSIX shell (the env reports Linux). Adjust shell quoting on Windows.
- L166: ⚠️ REVIEW: PLAN "Workflows" notes EAS relied on a committed `.npmrc` for workspace detection. Verify EAS (Phase 8) still keys off `.npmrc` presence vs. needing the linker setting itself — under pnpm 11 the linker is in `pnpm-workspace.yaml`, so if EAS expected `node-linker` *inside* `.npmrc` that workaround may need revisiting.
- L218: ⚠️ OPEN / TO CONFIRM: Exact dep versions. PLAN.md pins Turborepo 2.9 (so `turbo` is set to `2.9.0` — confirm the exact 2.9.x patch at install time; the 2.9.x line is live as of June 2026). Prettier/lefthook/typescript patch versions are not pinned in PLAN; the `^` ranges above are reasonable defaults — replace with whatever the lockfile resolves and pin if stricter reproducibility is wanted. `"name": "platform-template"` stays `platform-template` (matches the repo template), but note PLAN's naming convention warns the monorepo name never drives app/infra ids (those come from product names) — so this name is cosmetic only.
- L277: ⚠️ OPEN / TO CONFIRM: PLAN lists task names `openapi`, `build`, `export:web`, `dev`, `lint`, `typecheck`, `test`. It does not give a literal root `turbo.json`; the `outputs` for `build` (`dist`, generated `*.gen.ts`, `renderer`) are inferred from the graph description and may be refined per-package later. Confirm exact `turbo` 2.9.x schema URL/fields against the installed version.
- L319: ⚠️ OPEN / TO CONFIRM: PLAN names exactly three knobs (strict / moduleResolution bundler / noEmit). The additional flags above are conventional hardening, not PLAN-mandated — trim if a downstream tool (e.g. babel-preset-expo) conflicts.
- L433: ⚠️ OPEN / TO CONFIRM: Specific style knobs (printWidth 100, double quotes, etc.) aren't dictated by PLAN — these are conventional defaults. Adjust to team taste; they only need to be consistent repo-wide.
- L501: Module format note: PLAN's `tailwind.config.js` consumes this via `presets: ["@platform/config/tailwind-preset"]` and Tailwind configs are loaded by the Tailwind/NativeWind toolchain in CommonJS context. This file is authored as CommonJS (`module.exports`) even though the package is `"type": "module"`, hence the `.js` export maps to a CJS-shaped file. If Tailwind's loader rejects it under an ESM package, rename to `tailwind-preset.cjs` and update the `exports` subpath. ⚠️ TO CONFIRM against the NativeWind v4 + Tailwind toolchain in Phase 2.
- L557: ⚠️ OPEN / TO CONFIRM: The exact `types`/`lib` arrays per preset depend on packages introduced in Phase 2+ (`expo`, `react-native` type packages). Treat these as starting points; reconcile when the first app workspace is added.
- L685: # separate lefthook command needed. (See ⚠️ note below.)
- L702: ⚠️ OPEN / TO CONFIRM:
- L822: - uv exact pin — PLAN says "uv" / mise uses `latest`; pin an exact version once Phase 3's api Dockerfile depends on it. (⚠️ TO CONFIRM)
- L823: - Ruff lefthook scoping — exact `uv run --project …` invocation for "scoped to the touched product's api" is finalized in Phase 3 when an api exists; the `$(dirname …)` heuristic here is provisional. (⚠️ TO CONFIRM)
- L824: - pre-push pyright/pytest path — assumed to flow through turbo's per-api `typecheck`/`test` tasks (cached + affected). Confirm vs. explicit lefthook commands in Phase 3. (⚠️ TO CONFIRM)
- L825: - Exact dep versions — only Turborepo (2.9) and the Node/pnpm/Python pins are PLAN-locked; prettier/lefthook/eslint/typescript ranges are conventional defaults — replace with lockfile-resolved pins. (⚠️ TO CONFIRM)
- L826: - tailwind preset module format — CJS-shaped `.js` under an ESM package may need a `.cjs` rename depending on the NativeWind v4 Tailwind loader; verify in Phase 2. (⚠️ TO CONFIRM)
- L827: - `packages/config` `lint` task — Phase 1 has no lintable source there, so `turbo run lint` is a true no-op. Wire a real `lint` script into `@platform/config` (and into each package's `package.json`) so the turbo `lint` task does meaningful work from Phase 2 onward. (⚠️ TO CONFIRM)

### `docs/phase-2-design-system.md` (8)

- L6: ⚠️ OPEN / TO CONFIRM rather than invented.
- L642: ⚠️ NativeWind-in-RNW-Vite-Storybook is a known finicky integration (Storybook issue
- L787: // ⚠️ OPEN / TO CONFIRM: replace the placeholder node URL once the real Figma
- L831: ⚠️ Filename collision: the token-pipeline config (step (e)) is named `tokens.config.json`
- L846: ⚠️ Env-var distinction: the Code Connect CLI uses `FIGMA_ACCESS_TOKEN`
- L1736: - ⚠️ NativeWind v4 ↔ SDK 56 outcome — STRATEGY CONFIRMED (user decision 2026-06-15):
- L1743: - ⚠️ Exact version pins — freeze to what the CLI/`expo install` emit at execution time;
- L1754: - ⚠️ Real Figma file key + mode IDs — `figma.config.json` ships `TODO-*` placeholders;

### `docs/phase-3-api.md` (9)

- L47: "Testing strategy". Anything PLAN.md does not pin is marked ⚠️ OPEN / TO CONFIRM.
- L154: "slowapi==0.1.9",                # ⚠️ REVIEW: pin to the current slowapi release (self-described "alpha" — pin exact)
- L155: "uuid-utils==0.10.0",            # ⚠️ REVIEW: pin to the exact current uuid-utils release. Maintained UUIDv7 generator (Rust-backed, returns a stdlib-compatible UUID). Alt: uuid6. See note below.
- L617: time-ordered property is what makes the cursor pagination keyset stable. ⚠️ REVIEW: confirm
- L957: ⚠️ REVIEW (JWKS path): confirm the JWKS discovery path
- L1319: ⚠️ OPEN / TO CONFIRM (output path): `parents[3]` resolves
- L1583: role bypasses (⚠️ REVIEW: exact role/credentials are project-specific).
- L2118: (`BYPASSRLS`, bypasses even `FORCE RLS`); ⚠️ REVIEW the exact credentials when the project
- L2120: - ⚠️ export_openapi output path depth (`parents[3]`) — verify against the final layout;

### `docs/phase-4-typegen.md` (16)

- L27: marked ⚠️ OPEN / TO CONFIRM.
- L49: field names are ⚠️ OPEN / TO CONFIRM — read them from Phase 3's `schemas/` and
- L235: version the app uses. ⚠️ REVIEW: confirm the catalog exists in Phase 1 before relying on it.
- L305: ⚠️ OPEN / TO CONFIRM — cursor param name only. The cursor query parameter that drives
- L354: ⚠️ OPEN / TO CONFIRM: treating the committed `src/` as a turbo `output` is correct
- L402: if you declare both, or rely solely on Step 5. ⚠️ OPEN / TO CONFIRM which single
- L493: generated `src/index.ts` after Step 4. ⚠️ REVIEW: adjust the import above to match the
- L558: // (field name is ⚠️ OPEN / TO CONFIRM against Phase 3 schemas).
- L583: // Flatten cursor pages. `items` is the page array field (⚠️ OPEN / TO CONFIRM name).
- L619: // data/render API) — see the ⚠️ REVIEW note above before adding the dependency.
- L633: FlashList for long lists, swapping is mechanical. ⚠️ REVIEW: if the team standardizes on
- L635: - ⚠️ OPEN / TO CONFIRM — response field names. `items`, `next_cursor`, the cursor
- L785: hook's query keys. ⚠️ OPEN / TO CONFIRM: the exact `maxAge`/`gcTime` for persistence is
- L837: the `Item` DTO fields — defined by Phase 3's `schemas/`; match them. ⚠️ OPEN / TO
- L848: alone vs also in root) — standardize on one. ⚠️ OPEN / TO CONFIRM.
- L854: absent, pin exact versions inline. ⚠️ OPEN / TO CONFIRM.

### `docs/phase-5-desktop.md` (3)

- L164: ⚠️ REVIEW: confirm the exact `typescript` patch (`5.9.3` shown) matches the version the rest
- L558: - ⚠️ OPEN / TO CONFIRM: the root `turbo.json` must define a base `build`/`typecheck` task for
- L829: - ⚠️ REVIEW — build-resources / icons. `electron-builder.yml` references `build-resources/`;

### `docs/phase-6-auth.md` (7)

- L53: ⚠️ OPEN / TO CONFIRM — exactly how complete `auth.py`/`me.py` were left at the end of
- L502: ⚠️ REVIEW: on React Native, fetching a `file://` URI to a `Blob` has historically been
- L668: ⚠️ OPEN / TO CONFIRM — exact `ThemeProvider` / `QueryProvider` export names + the
- L993: ⚠️ OPEN / TO CONFIRM — Phase 3's exact `problem()` signature/`errors.py` API and whether the
- L1144: - ⚠️ OPEN / TO CONFIRM — exact pinned versions of `@supabase/supabase-js`,
- L1151: - ⚠️ OPEN / TO CONFIRM — Phase 3 reconciliation. The Phase 3 guide (`docs/phase-3-api.md`)
- L1155: - ⚠️ OPEN / TO CONFIRM — Phase 2 export names for `ThemeProvider` / `QueryProvider` and the

### `docs/phase-7-generator.md` (9)

- L46: ⚠️ OPEN / TO CONFIRM.
- L609: ⚠️ OPEN / TO CONFIRM — whether `pnpm bootstrap` should start all products or just the
- L800: enumerating them; the matrix above is this guide's concrete set. ⚠️ OPEN / TO CONFIRM
- L803: all (to satisfy the simultaneous-stacks verify). ⚠️ OPEN / TO CONFIRM.
- L806: ports `config.toml` declares; confirm none exceed the block or collide. ⚠️ OPEN / TO
- L810: ports at all (vs real hosts that the infra checklist later fills) is ⚠️ OPEN / TO
- L814: `TEXT_EXT` in sync with the template's file types. ⚠️ OPEN / TO CONFIRM.
- L818: the mode-registration key may differ. ⚠️ OPEN / TO CONFIRM against Phase 2.
- L824: `prepare`. ⚠️ OPEN / TO CONFIRM.

### `docs/phase-8-cicd-obs.md` (9)

- L309: ⚠️ REVIEW: Phase 2's `metro.config.js` uses `getDefaultConfig`; here it is swapped for
- L530: ⚠️ REVIEW: the broadcast-only architecture and the client side
- L552: or let it raise per product policy). ⚠️ OPEN / TO CONFIRM: PLAN.md does not pin whether a
- L658: Requires an `updated_at` column on `PushToken` (add to the UUIDv7 base or the model). ⚠️
- L659: OPEN / TO CONFIRM: PLAN.md says "prune stale push tokens" but does not define "stale" —
- L768: ⚠️ OPEN / TO CONFIRM: PLAN.md says E2E runs "against exported dist + api + supabase local"
- L1475: - ⚠️ OPEN / TO CONFIRM — broadcast failure policy: whether a Supabase broadcast failure
- L1478: - ⚠️ OPEN / TO CONFIRM — "stale" push-token definition: PLAN.md says "prune stale push
- L1481: - ⚠️ OPEN / TO CONFIRM — E2E process orchestration: the exact background-API start +

## 2. TODO / PLACEHOLDER fill-in tokens (intentional swap-points — counted, not gaps)

- `docs/phase-2-design-system.md`: 10
- `docs/phase-3-api.md`: 1
- `docs/phase-5-desktop.md`: 14
- `docs/phase-6-auth.md`: 7
- `docs/phase-7-generator.md`: 35
- `docs/phase-8-cicd-obs.md`: 20

Canonical swap-points: `example` (org), `com.example.*` (bundle/appId), `TODO-EAS-PROJECT-ID`, `TODO-FIGMA-FILE-KEY`, `TODO-FIGMA-MODE-ID`, `PLACEHOLDER-pin-exact` (version pins), `PLACEHOLDER` secret/org names — all verified by the Phase 7/8 `git grep -inE 'example|TODO'` gate.

## 3. Deferred-by-design

See each guide's `## Open questions / deferred` section (the entries marked *Deferred* / *RESOLVED*). The dependent phase's `## Prerequisites` re-checks them; the cross-phase map is in PLAN.md's "Accuracy review" + phases table.
