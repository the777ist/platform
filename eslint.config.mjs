// Root ESLint flat config — re-exports the shared @sevenfold/config preset.
// ESLint 9 resolves its flat config from the CWD, and the lefthook pre-commit job runs
// `pnpm eslint {staged_files}` from the repo root — so the root needs a discoverable config.
// All rules/ignores live in @sevenfold/config (single source of truth); do not add rules here.
export { default } from "@sevenfold/config/eslint";
