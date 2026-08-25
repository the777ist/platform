#!/bin/sh
# .lefthook/ruff.sh — pre-commit Ruff lane, grouped by owning uv project.
#
# WHY a script and not inline YAML: inline shell in lefthook.yml loses shellcheck, exit-code
# clarity, and the ability to run the lane by hand — which is the first thing anyone does when
# a hook fails. Run it directly with:  sh .lefthook/ruff.sh check path/to/file.py
#
# WHY grouped: "No shared Python between products" (CLAUDE.md) — each product api is its OWN uv
# universe with its own .venv and ruff. A commit that touches two products' APIs therefore needs
# ruff invoked once PER project, with only that project's files. Resolving one project from the
# first staged file and applying it to all of them silently lints product B's code with product
# A's toolchain.
set -eu

mode="$1"
shift
[ "$#" -gt 0 ] || exit 0

# Walk UP from a file to the nearest pyproject.toml. (A bare `dirname`/.. only works for files
# exactly one level deep — src/<mod>/routers/items.py is four.)
project_of() {
  d=$(dirname "$1")
  while [ "$d" != "." ] && [ "$d" != "/" ] && [ ! -f "$d/pyproject.toml" ]; do
    d=$(dirname "$d")
  done
  if [ -f "$d/pyproject.toml" ]; then printf '%s\n' "$d"; fi
}

projects=$(for f in "$@"; do project_of "$f"; done | sort -u)
[ -n "$projects" ] || exit 0

status=0
for p in $projects; do
  files=""
  for f in "$@"; do
    if [ "$(project_of "$f")" = "$p" ]; then files="$files $f"; fi
  done
  [ -n "$files" ] || continue
  case "$mode" in
    # No --exit-non-zero-on-fix: this tier REPAIRS, it does not report. A violation ruff cannot
    # fix still exits non-zero and blocks the commit, which is the behaviour we want.
    check) uv run --project "$p" ruff check --fix $files || status=$? ;;
    format) uv run --project "$p" ruff format $files || status=$? ;;
    *)
      echo "ruff.sh: unknown mode '$mode' (expected: check | format)" >&2
      exit 2
      ;;
  esac
done
exit "$status"
