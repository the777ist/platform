# RENAME.md — the template-to-real-repo renaming playbook

A repo carrying the template's generic identity — README `# Cross-Platform Template`,
root package `platform`, org placeholder `example`, package scope `@platform/*` — gets
renamed to its real identity with this playbook. It is the complete, commit-verified
procedure: extracted from the actual rename of THIS repo to `the777incident` (commits
`fa2eb9f` → `eea8a91` → `114a0ed`, PRs #6–#8, 117 file changes), then validated by
running it in REVERSE and reproducing the pre-rename tree **byte-exactly**.

It is a SUPERSET of that run, not a transcript of it: four spots the original rename
missed are folded in (each marked **Missed by the real run**), so following this
end-to-end lands a more complete rename than `the777incident` itself carries.

Throughout, `<repo>` = your new identity (worked example: `the777incident`). One identity
serves as repo name, org, and scope here; if yours differ, substitute per layer.

Scope: this renames the IDENTITY only. Anything the real repo grew afterwards — products
stamped post-rename, a logo, scratchpad notes — is separate work and deliberately absent
here. Run the playbook and the tree is byte-identical to a renamed template, not to a
particular repo's later history.

## The identity model

| Layer            | Generic value                          | Renamed to  | Commit    |
| ---------------- | -------------------------------------- | ----------- | --------- |
| 1. Repo identity | `Cross-Platform Template` / `platform` | `<repo>`    | `fa2eb9f` |
| 2. Org           | `example` (placeholder)                | `<repo>`    | `eea8a91` |
| 3. Package scope | `@platform/*`                          | `@<repo>/*` | `114a0ed` |

**The fourth layer is machinery — NEVER rename it:**

- **The `template` product token + `products/_template`** — the generator's
  find-and-replace mold (`pnpm new-product blog` rewrites whole-word `template` → `blog`).
  The token must NEVER equal the org/repo name: the stamper rewrites EVERY occurrence of
  the token, so it would mangle the org names too (`<repo>-blog-blog-api-stg`,
  `com.blog.blog`…).
- **Brand modes `template` | `demo`** — per-PRODUCT by design (Figma modes ARE brand
  modes); every stamped product gets its own mode named after it.
- **Workflow paths/filters** (`products/_template/**`, `*template-*`) — they point at the
  mold directory and product-token package names.
- **`products/demo`'s `demo` tokens** — it's a stamp; only its ORG half renames (layer 2),
  applied identically to `_template` and `demo` (stamp invariant below).
- **`TODO-*` ids** (EAS project id, Figma file key/mode ids, Supabase URLs, DSNs) — real
  external accounts that only exist on infra day. After the rename,
  `git grep -inE 'TODO'` is the swap-point audit.

## Non-negotiable constraints (each one bit us or was proven in the real run)

1. **Stop the local Supabase stacks BEFORE touching `supabase/config.toml`**
   (`supabase stop` in `products/_template` AND `products/demo`) — the CLI resolves
   containers by the CURRENT `project_id`; change it first and the old containers/volumes
   orphan. Restart after; fresh volumes/DBs are re-migrated + seeded by the E2E run.
2. **Exact-count, per-file replacements — never a blind repo-wide sed.** Assert the
   expected occurrence count per string per file (a script that dies on mismatch). The
   keep-list below is exactly what a blind sed corrupts.
3. **Whole-word tokens only.** Rewrites (yours and the generator's) cannot see into longer
   identifiers — `template_api_rls_test` survived a stamp untouched once and collided on
   CI's shared Postgres. Derived names in `_template` keep the token word-delimited
   (`"template_api" + "_suffix"`). Audit with SUBSTRING grep
   (`git grep -i template products/<name>`), never just `-iw`.
4. **Stamp invariant.** Every product-file edit lands in `_template` AND `demo`
   identically; verify each pair is byte-identical modulo the token rewrite — EXCEPT the
   generator's own port math (`supabase/config.toml` 543xx block = `54321+100·portIndex`;
   `api/package.json` dev script `--port 8000+10·portIndex`), which legitimately differs.

   ```python
   import re
   def stamp(s):  # mirror of the generator's whole-word rewrite
       s = re.sub(r"\btemplate_api\b", "demo_api", s)
       s = re.sub(r"products/_template\b", "products/demo", s)
       s = re.sub(r"\bTemplate\b", "Demo", s)
       return re.sub(r"\btemplate\b", "demo", s)
   # stamp(template_file) == demo_file  (config.toml / api dev-script ports excluded)
   ```

5. **Re-run prettier AFTER EACH layer's replacements** (`pnpm run format`), not once at
   the end. Markdown tables pad to their widest cell; a different-length name changes
   widths and a pure string swap leaves stale padding that `format:check` fails. Found by
   the reverse-run test — it was the ONLY difference from byte-exactness. WHICH layer
   drifts depends on the new name's length vs the old string in each table (the
   `sevenfold` run drifted only at layer 3) — and the ship model requires every layer's
   PR to be CI-green on its own, so format each layer before committing it.
6. **Generated files are never hand-edited.** `pnpm-lock.yaml` regenerates via
   `pnpm install` (run it after the scope layer — the workspace names live in it). The
   api-client `src/` + `openapi.json` regenerate via typegen; only the api-client's own
   `package.json`/`tsconfig.json` are yours to edit. After the scope rename, "drift" on
   api-client means changes under `src/` or `openapi.json` — your config edits are not
   drift.
7. **TOML keys literally named `template`** (supabase `config.toml` `[auth.sms]` /
   `[auth.mfa.phone]` message template) are config-schema names, not product tokens — the
   generator masks them; your edits must not touch them either.

## Layer 1 — repo identity (6 files, 7 lines — commit `fa2eb9f` + one gap fix)

| File                   | Change                                                                                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`            | title `# Cross-Platform Template` → `# <repo>`                                                                                                                                               |
| `package.json`         | `"name": "platform"` → `"name": "<repo>"` (nothing filters on it; keep the `packageManager` field — eas-cli workspace detection)                                                             |
| `CLAUDE.md`            | header `platform monorepo` → `<repo> monorepo`                                                                                                                                               |
| `PHILOSOPHY.md`        | title gains the repo name                                                                                                                                                                    |
| `products/*/README.md` | "in the platform monorepo" → "in the `<repo>` monorepo" — `_template` AND `demo` identically (stamp-invariant pair). MISSED by the original `fa2eb9f` run; found by the `sevenfold` test run |

`PHILOSOPHY.md`'s title RESHAPES rather than just gaining a prefix — the interior em-dash
moves to the front: `# Multi-Product Cross-Platform Monorepo — Philosophy` →
`# <repo> — Multi-Product Cross-Platform Monorepo Philosophy`.

## Layer 2 — bake the org (commit `eea8a91` = 29 files / 80 lines; 2b widens it)

Values first (below), then the prose that describes them (2b) — one commit, two halves.

Per product — `products/_template` AND `products/demo`, identically:

| File                                               | What carries the org                                                                      |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `api/fly.staging.toml` + `api/fly.production.toml` | `app = "<org>-<product>-api-stg\|prod"`                                                   |
| `api/src/<module>/tasks.py`                        | 4× fly-run docstring app names                                                            |
| `app/app.config.ts`                                | `bundleIdentifier` + `package` (`com.<org>.<product>`), Sentry `organization` + `project` |
| `app/.env.staging` / `.env.production`             | API URL value + its comment (2 each)                                                      |
| `app/.maestro/login.yaml`                          | `appId`                                                                                   |
| `desktop/electron-builder.yml`                     | `appId`, `copyright`, publish `owner`                                                     |
| `supabase/config.toml`                             | `project_id` (+ its comment) — STACKS STOPPED FIRST                                       |
| `CLAUDE.md`                                        | 6 spots: desktop appId, releases repo, project_id, Fly/Supabase/Sentry names, org note    |
| `.claude/commands/release.md`                      | desktop-releases repo owner                                                               |

Root level:

- `README.md` — the create-a-product infra checklist (3 `<org>` mentions)
- `CLAUDE.md` — the naming-convention line
- `PHILOSOPHY.md` — 11 spots: naming-conventions header block, keep-placeholders sentence,
  key ruling #3 (desktop-releases), directory-tree annotations (project_id, bundle ids,
  appId, publish target, fly app), generator checklist spec, the naming-audit verification
  item (post-rename it becomes `git grep TODO`), the multi-product infra-naming line
- `.github/workflows/deploy-api.yml` — the org comment
- `.claude/commands/ptfm-product.md` + `.claude/commands/release.md` — infra-name mentions
- **`scripts/new-product.mjs`** — `const org = "..."` + checklist wording (this is what
  makes every FUTURE stamp come out under the real org with a matching checklist)
- **`scripts/remove-product.mjs`** — `const org = "..."` + the hardcoded
  `com.supabase.cli.project=<org>-${name}` docker-volume hint (post-dates the original
  run — added on main after the `sevenfold` verification)

### Layer 2b — de-placeholder the prose (same commit, easiest half to miss)

The tables above say where the org's VALUE lives. This half is where the org's STATUS is
asserted — every sentence, comment, and `<org>` token that calls the org a placeholder.
Baking the org makes those claims FALSE, so they change with the values or the tree
contradicts itself (`owner: <repo> # PLACEHOLDER org`). A value-only sweep passes every
gate and still leaves ~25 lines lying about the repo.

**The rule:** the ORG is now known, so any "placeholder" wording or `<org>` token that
refers to the ORG resolves. Wording about infra that still does not exist — Fly apps, the
desktop-releases repo, the EAS project id, Sentry projects/DSNs, signing certs, CI
secrets, brand assets — STAYS a marked placeholder. That distinction is what makes the
post-rename audit `git grep TODO` (not `git grep example`).

Keep `<org>` only where it is the naming-convention PATTERN (`<org>-<product>-<env>`,
`<org>/<product>-desktop-releases` as a shape); substitute it wherever it stands in for
THIS repo's actual owner in a concrete name or path.

Per product — `products/_template` AND `products/demo`, identically:

- `app/app.config.ts` — the two Sentry trailing comments:
  - `// PLACEHOLDER org slug` → `// the org (Sentry org created on infra day)`
  - `// PLACEHOLDER Sentry project slug` → `// Sentry project slug (created on infra day)`
- `desktop/electron-builder.yml` — three spots, not one (and a fourth that stays):
  - header line 3, "…the `<org>` owner is a marked placeholder until a real org exists"
    → the owner is the `<repo>` org (only the appId/publish-repo halves stay generator
    placeholders). **Missed by the real run** — it still contradicts line 47 there
  - `owner: <repo> # PLACEHOLDER org` → `# the org (releases repo created on infra day)`
  - the `repo:` line's trailing comment `# <org>/<product>-desktop-releases (per-product)`
    → `# <repo>/<product>-desktop-releases (per-product)`. **Missed by the real run**
  - line 42's `# PLACEHOLDER until a real releases repo exists (Key ruling #3)` STAYS —
    the repo genuinely does not exist yet
- `CLAUDE.md` — 2 spots beyond the value swaps:
  - on the desktop line, `<org>` resolves AND the ``(org placeholder `example`)``
    parenthetical is DELETED, not reworded — the sentence just ends after the repo path
  - ``(`example` = org placeholder.)`` → ``(`<repo>` = the org.)``
- `.claude/commands/release.md` — `` `<org>/<product>-desktop-releases` `` →
  `` `<repo>/<product>-desktop-releases` ``

Root level:

- `CLAUDE.md` — the naming line is REWRITTEN, not swapped (this is also layer 3's semantic
  follow-up; do it once, in whichever layer you reach first): "Naming derives from the
  PRODUCT, never the repo: … (org placeholder `example`)" → "Naming: the org prefix is
  `<repo>` (`@<repo>/*` packages, `com.<repo>.*` bundle ids, infra
  `<repo>-<product>-<env>`); the PRODUCT segment always derives from the product name,
  never the repo."
- `PHILOSOPHY.md` — 4 prose rewrites on top of the value swaps already listed:
  - naming-conventions header block: `com.example.*` loses "(placeholder until a real
    reverse-domain is chosen)" → "(the org reverse-domain)"; "(org placeholder `example`)"
    → "(org `<repo>`)"; and the keep-placeholders sentence narrows to the survivors —
    "Keep the remaining placeholders (`TODO-EAS-PROJECT-ID` and friends) clearly marked;
    the org `<repo>` is baked in — create its infra accounts on infra day."
  - the Multi-product stack bullet's `infra naming <org>-<product>-<env>` gains
    "(org `<repo>`)"
  - key ruling #3: "`<org>/<product>-desktop-releases` repo (placeholder until real
    org/repo exists)" → "`<repo>/<product>-desktop-releases` repo (created on infra day)"
  - verification item #5: the audit itself narrows from `git grep -inE 'example|TODO'` to
    `git grep -inE 'TODO'`, and "with clearly marked `example` org placeholders" becomes
    "with the org `<repo>` baked in"
- `.claude/commands/release.md` + `.claude/commands/ptfm-product.md` — the `<org>` tokens
  in `<org>/<product>-desktop-releases` and `<org>-<product>-<env>` resolve to `<repo>`
- `.github/workflows/deploy-api.yml` — the header comment: "All secrets/app names are
  clearly-marked placeholders (org placeholder `example`) until real infra exists." →
  "All secrets/app names carry the org `<repo>`; the Fly apps themselves are created on
  infra day."
- **`.github/workflows/electron-release.yml`** — 3 `<org>/<product>-desktop-releases`
  mentions (header comment, the DESKTOP_RELEASES_TOKEN comment, the `GH_TOKEN:` trailing
  comment). The `# PLACEHOLDER` markers on the secrets themselves STAY. **The file was
  absent from the original layer-2 commit entirely** — it is still un-renamed there
- `scripts/new-product.mjs` — beyond `const org`: the comment `// placeholder org` →
  `// the org`; the checklist banner "(swap the ${org} placeholders for real org values)"
  → "(create these under the ${org} org)"; and the desktop line's literal
  `<org>/${name}-desktop-releases` → `${org}/${name}-desktop-releases` (interpolate it —
  the checklist now prints a real repo path)
- `scripts/remove-product.mjs` — the same `// placeholder org` → `// the org` comment

## Layer 3 — package scope (84 files, 239 occurrences + lockfile — commit `114a0ed`)

Method: uniform string replace `@platform` → `@<repo>` in every tracked file EXCEPT
`pnpm-lock.yaml` AND this playbook itself (`RENAME.md` documents the GENERIC
identity; rewriting it corrupts the procedure), then
`pnpm install` to regenerate the lockfile. Expected: exactly 239 occurrences across
83 files (the lockfile is the 84th changed file). The one string uniformly covers
every context it hides in — the full hiding-spot list from the real commit:

- 11 package.json `name`s + all `workspace:*` dependency entries
- every TS/TSX import in `packages/*` and both products' app/feature/route files
- `tsconfig.json` `extends` (`@<repo>/config/tsconfig/expo`) — 5 files
- `tailwind.config.js` preset `require`s AND the content-glob
  `require.resolve("@<repo>/ui/package.json")` — ui + both apps
- `packages/ui/jest.config.js` — the `transformIgnorePatterns` REGEX (`@<repo>/.*`)
- `.github/workflows/e2e-nightly.yml` — 4 `pnpm --filter @<repo>/...` lines
- root `eslint.config.mjs` (re-exports `@<repo>/config/eslint`) + `lefthook.yml` comment
- `packages/config/tailwind-preset.cjs`, `packages/core/src/api.ts`,
  `products/*/desktop/turbo.json` — scope in comments
- `packages/ui/.storybook/visual-regression.spec.ts` — command strings in comments/errors
- all docs: root + product README/CLAUDE.md, `packages/ui` CLAUDE.md, every ptfm command,
  the thin commands (`add-component`, `dev`, `add-feature`)

Semantic follow-up: reword the root `CLAUDE.md` naming line — the org prefix now derives
from the repo, but the PRODUCT segment still always derives from the product name.

The generator is scope-agnostic (it rewrites the product token INSIDE package names), so
stamps come out `@<repo>/<name>-app` automatically — proven by the first post-rename stamp
(`stream` → `@the777incident/stream-app`, `the777incident-stream-api-stg`, clean sweep).

## The keep-list — strings a blind replace corrupts (verified every one)

- `@example.com` / `example.test` — RFC-reserved fixture domains in tests/e2e specs
- `.env.example` — filenames (product CLAUDE/README, generator skip-list comments)
- Code Connect's `example:` — the Figma SDK's API property in `*.figma.tsx`
- swagger "View examples" text in the GENERATED api-client — never hand-edited
- `.npmrc` `registry.example.com` sample comment; supabase config's commented Clerk domain
- the English words "example"/"template" in prose; `snapshotPathTemplate` (Playwright API)
- TOML `template =` keys (constraint 7)
- **`RENAME.md` itself** — it documents the generic identity and the
  worked example. Exclude them from every layer's replacements AND from the residual
  audits (`':!RENAME.md'`), or layer 3 corrupts the playbook and the
  239-occurrence count won't reproduce
- **placeholder wording that is still TRUE after the rename** (layer 2b's rule): the
  `# PLACEHOLDER` secret markers in every workflow, `.env.staging|production`'s "Values
  are MARKED PLACEHOLDERS until real infra exists", electron-builder's cert/notarization
  and releases-repo markers, `TODO-EAS-PROJECT-ID`, the Figma placeholder modeIds, the
  brand-asset placeholders, `seed.py`'s placeholder user, `export_openapi.py`'s inert
  placeholder DB URLs, and NativeWind/RN `placeholder` props + Playwright
  `getByPlaceholder` — none of these are about the ORG
- the word `platform` outside the identity spots: generic prose ("each platform's native
  store", PHILOSOPHY's "platform/template monorepo"), APIs (`process.platform`,
  Playwright's `{platform}` token), and the `PATCH(platform)` tag inside
  `patches/*.patch` (patch content is hash-pinned by `patchedDependencies` — renaming
  the tag is pure lockfile churn)

## Verify — every gate, uncached (as actually run)

```bash
supabase start                      # both products — new project_ids, fresh volumes
pnpm run format:check
pnpm turbo run lint typecheck build openapi --force
pnpm turbo run test --filter='!@<repo>/template-api' --filter='!@<repo>/demo-api' --force
git status --porcelain products/*/api-client/src products/*/api/openapi.json  # real drift only
# E2E prerequisite the original run had ambiently: each product needs its machine-local
# (gitignored) api/.env — the API webServer boots with cwd api/ so pydantic-settings
# reads it (CI provides env vars instead). On a fresh clone, build it from
# products/<p>/.env.example with the product's OWN ports (DB 54322+100·portIndex — the
# local pooler is disabled, use the direct port for BOTH URLs; SUPABASE_URL
# 54321+100·portIndex) and the local stack's SERVICE_ROLE_KEY + JWT secret
# (`supabase status`), or the E2E dies with "config.webServer was not able to start"
# on missing database_url/database_migration_url. OMIT keys you have no value for —
# do NOT copy `SUPABASE_JWKS_URL=` (empty) verbatim from .env.example: pydantic reads
# it as "" (not None), the API then builds PyJWKClient("") and the JWKS PRIMARY auth
# path silently dies, surfacing as 401 "The specified alg value is not allowed" on
# every authed call (the HS256 fallback rejecting the ES256 token).
cd products/_template/app && CI=1 pnpm exec playwright test     # full-stack E2E
cd products/demo/app      && CI=1 pnpm exec playwright test     # full-stack E2E (stamp)
# The api pytest suites read TEST_DATABASE_URL and default to localhost:5432 (the CI
# service-container port mapping). Locally each product's DB is on its own port
# (54322 + 100·portIndex) and 5432 may be a FOREIGN Postgres — one turbo invocation
# cannot carry two URLs, so run the api tests per product. ORDER MATTERS: run them
# AFTER the E2E — pytest's create_all() tolerates the alembic-built schema, but
# alembic (the E2E's migrate step) dies with DuplicateTable on a create_all-built one
# (`supabase db reset` in the product dir un-wedges a contaminated stack DB).
TEST_DATABASE_URL=postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres \
  pnpm turbo run test --filter=@<repo>/template-api --force
TEST_DATABASE_URL=postgresql+psycopg://postgres:postgres@127.0.0.1:54422/postgres \
  pnpm turbo run test --filter=@<repo>/demo-api --force
pnpm --filter @<repo>/ui build-storybook                        # VR serves storybook-static —
cd packages/ui            && pnpm exec playwright test          #   build it first (as CI does),
                                                                #   else webServer times out
git grep -in '<old-tokens>' -- ':!pnpm-lock.yaml' ':!RENAME.md'  # residual → keep-list only
# Layer 2b completeness — these three must come back EMPTY (except this playbook):
git grep -inE 'org placeholder|PLACEHOLDER org|placeholder org' -- ':!RENAME.md'
git grep -inF '<org>' -- ':!RENAME.md'   # only the <org>-<product>-<env> PATTERN may remain
git grep -in 'placeholder' -- ':!pnpm-lock.yaml' ':!RENAME.md'  # every hit must be keep-list
```

Plus the stamp-invariant script (constraint 4) over every changed product-file pair.

## Ship

One PR per layer (identity → org → scope), each CI-green before the next — diffs stay
reviewable and failures isolate to their layer. Confirm each layer's commit actually
LANDED (`git log`) before starting the next: lefthook runs prettier+eslint pre-commit,
and a broken hook environment (e.g. an untrusted `mise.toml` on a fresh clone — run
`mise trust` first) aborts the commit while a chained follow-up command happily keeps
going — the next layer then silently amends/mixes into the wrong commit. After merging: the main-push deploy
workflows skip green (secret-gated until infra day); dispatch `e2e-nightly` once to prove
the full nightly path on the renamed state.

## Aftermath — post-rename symptoms that are NOT bugs

- **VS Code Tailwind IntelliSense** "can't resolve `@<repo>/config/tailwind-preset`" —
  its language server caches module resolution from before the rename. `Developer:
Reload Window`. Node itself resolves fine (verify:
  `node -e "require.resolve('@<repo>/config/tailwind-preset',{paths:['packages/ui']})"`).
- **Docker cruft** — old volumes remain under the previous project ids:
  `docker volume ls --filter label=com.supabase.cli.project=<old-org>-template` (safe to
  `docker volume rm`; disposable local seed/test data).
- **Turbo cache** — new package names = new hashes; the first gate run is fully uncached.
- **New products** — `pnpm new-product <name>` now stamps correctly (re-proven post-
  `sevenfold`: `@sevenfold/stream-app`, `com.sevenfold.stream`,
  `sevenfold-stream-api-stg`, zero residuals on the substring audit), but remember its
  checklist's workflow item: `deploy-api.yml`/`eas-update.yml` enumerate products
  explicitly in their `changes` filters — add the new product's entries or main pushes
  never deploy it. `pnpm remove-product <name>` is the automated inverse of a stamp
  (stops the product's stack, deletes the tree, restores tokens.config.json, reinstalls;
  pass `--yes` in non-interactive shells).

## Reversibility

The whole procedure is an involution: run it with OLD/NEW swapped and it restores the
generic identity — proven by reverse-applying it and reproducing the pre-rename tree
byte-exactly.
