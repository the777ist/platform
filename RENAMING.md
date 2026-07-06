# Renaming playbook — rebrand this monorepo to a new identity

How to rename this template monorepo (repo name, org, package scope) without breaking the
product-stamping machinery. Battle-tested in BOTH directions: this procedure renamed a copy
of this repo from its generic identity (`Cross-Platform Template` / org placeholder
`example` / scope `@platform/*`) to `the777incident`, and then — run in reverse — restored
this snapshot to generic, reproducing the pre-rename tree byte-exactly. Follow it to
rebrand to YOUR identity.

## The three identity layers (rename these)

| Layer            | What it is                        | Examples                                                                                                                                   |
| ---------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Repo identity | How the repo names ITSELF         | README title, root `package.json` `name`, root `CLAUDE.md` header, `PHILOSOPHY.md` title                                                   |
| 2. Org           | The `<org>` in every derived name | fly apps `<org>-<product>-api-stg\|prod`, bundle ids `com.<org>.<product>`, Sentry org/project, supabase `project_id`, releases repo owner |
| 3. Package scope | The workspace npm scope           | `@<org>/ui`, `@<org>/core`, `@<org>/config`, `@<org>/<product>-{app,api,api-client,desktop}`                                               |

## The fourth layer is NOT identity — never rename it

- **The `template` product token and `products/_template`** — the generator's find-and-replace
  mold: `pnpm new-product blog` copies `_template` and rewrites whole-word `template` → `blog`.
  **The token must never equal the org name**: the stamper rewrites EVERY occurrence of the
  token, so it would mangle the org names too (`<org>-blog-blog-api-stg`, `com.blog.blog`…).
- **Brand modes (`template` | `demo`)** — per-PRODUCT by design (Figma modes ARE brand modes);
  each stamped product gets its own mode named after it.
- **Workflow paths/filters** (`products/_template/**`, `*template-*`) — they point at the mold
  directory and product-token package names; they only change if the mold does.
- **Fixtures & API names** — `@example.com` / `example.test` (RFC-reserved test domains),
  `.env.example` filenames, Code Connect's `example:` property (Figma SDK API), swagger text in
  the generated client, the `.npmrc` sample-registry comment, English "example" in prose.
- **`TODO-*` ids** (EAS project id, Figma file keys, Supabase URLs, DSNs) — external-account
  ids that only exist once the real accounts are created; `git grep -inE 'TODO'` is the audit.

## Hard constraints (learned the hard way)

1. **Whole-word tokens only.** The generator's rewrite cannot see into longer identifiers
   (`template_api_rls_test` stays unrewritten in a stamp). When constructing derived names in
   `_template`, keep the token word-delimited (`"template_api" + "_suffix"`). Audit stamps with
   the SUBSTRING grep `git grep -i template products/<name>`, never just `-iw`.
2. **Stamp invariant.** `products/demo` (and any stamp) must stay byte-identical to `_template`
   modulo the token rewrite and the generator's port math (`config.toml` Supabase block
   `54321+100·portIndex`, api dev script `8000+10·portIndex`). Apply every product-file edit to
   `_template` AND each stamp identically, then verify (script below).
3. **Stop local Supabase stacks BEFORE changing `project_id`** (`supabase stop` in each product
   dir) — the CLI resolves containers by the CURRENT config value; change it first and the old
   containers/volumes orphan. Restart after; fresh DBs re-migrate/seed in the E2E run.
4. **Generated files are never hand-edited.** The lockfile regenerates via `pnpm install`; the
   api-client `src/` regenerates via typegen (its `package.json`/`tsconfig.json` are yours to
   edit). After a scope rename, `git diff` on api-client shows YOUR config edits — real drift
   is any change under `src/` or `openapi.json`.

## Procedure

### 0. Preflight

```bash
supabase stop           # in products/_template AND every stamp (products/demo)
git grep -inE 'OLD-ORG|OLD-NAME' -- ':!pnpm-lock.yaml'   # inventory before touching anything
```

Classify every hit against the keep-list above before replacing. Use exact-count, per-file
replacements (assert expected occurrence counts) — never a blind repo-wide sed.

### 1. Repo identity

README title, root `package.json` `name` (verify nothing filters on it), root `CLAUDE.md`
header + naming-convention line, `PHILOSOPHY.md` title.

### 2. Org bake (per product — `_template` and every stamp, identically)

- `api/fly.staging.toml` + `api/fly.production.toml` — `app = "<org>-<product>-api-…"`
- `api/src/<module>/tasks.py` — fly-run docstrings
- `app/app.config.ts` — `bundleIdentifier`/`package` (`com.<org>.<product>`), Sentry
  `organization` + `project`
- `app/.env.staging` + `.env.production` — API URLs (comment + value)
- `app/.maestro/*.yaml` — `appId`
- `desktop/electron-builder.yml` — `appId`, `copyright`, publish `owner`
- `supabase/config.toml` — `project_id` (stacks stopped first!)
- product `CLAUDE.md`, `README.md`, `.claude/commands/release.md` — infra names

Root level: README create-a-product checklist, root `CLAUDE.md` naming line, `PHILOSOPHY.md`
(naming conventions, desktop-releases ruling, directory tree, generator checklist spec, the
naming-audit verification item), `deploy-api.yml` org comment, `ptfm-product.md` +
`release.md` infra mentions, and **`scripts/new-product.mjs` `const org`** (so stamps and the
printed infra checklist come out under the new org).

### 3. Package scope

Uniform string replace `@old-scope` → `@new-scope` in every tracked file EXCEPT
`pnpm-lock.yaml`, then `pnpm install` to regenerate it. The one string covers: package names,
`workspace:*` deps, imports, tsconfig `extends`, tailwind preset `require`s +
`require.resolve` content globs, the jest `transformIgnorePatterns` regex, workflow
`pnpm --filter` lines, and docs. The generator is scope-agnostic — it rewrites the product
token INSIDE package names, so stamps come out `@new-scope/<name>-app` automatically.

### 3½. Re-run prettier — table padding is name-length-dependent

```bash
pnpm run format   # prettier --write
```

Markdown tables (README tech-stack, PHILOSOPHY) are padded to their widest cell; a longer
or shorter scope/org changes cell widths, and a pure string replacement leaves stale
padding that `format:check` will fail. Found by the reverse-run test: without this step the
reverted tree differed from the original by nothing but table whitespace.

### 4. Verify — every gate, uncached

```bash
supabase start                                   # both products, new project_ids
pnpm run format:check
pnpm turbo run lint typecheck test build openapi --force
git diff --exit-code products/*/api-client/src products/*/api/openapi.json   # real drift only
cd products/_template/app && CI=1 pnpm exec playwright test    # full-stack E2E, template
cd products/demo/app      && CI=1 pnpm exec playwright test    # full-stack E2E, stamp
cd packages/ui            && pnpm exec playwright test         # VR, all stories × themes
git grep -inE '\bOLD-ORG\b|@old-scope'                         # residual audit → keep-list only
```

Stamp-invariant check (run for every changed `_template` file against its stamp twin):

```python
import re
def stamp(s):  # mirror the generator's whole-word rewrite; ports are generator-owned
    s = re.sub(r"\btemplate_api\b", "demo_api", s)
    s = re.sub(r"products/_template\b", "products/demo", s)
    s = re.sub(r"\bTemplate\b", "Demo", s)
    return re.sub(r"\btemplate\b", "demo", s)
# stamp(template_file_text) == demo_file_text, except config.toml / api dev-script port math
```

### 5. Ship

One PR per layer (identity → org → scope), each CI-green before the next — incremental diffs
stay reviewable and a failure isolates to its layer. After merging, dispatch `e2e-nightly`
once (`workflow_dispatch`) to prove the full nightly path on the renamed state.
