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

case "$mode" in
  check | format) ;;
  *)
    echo "ruff.sh: unknown mode '$mode' (expected: check | format)" >&2
    exit 2
    ;;
esac

# Walk UP from a file to the nearest pyproject.toml. (A bare `dirname`/.. only works for files
# exactly one level deep — src/<mod>/routers/items.py is four.)
project_of() {
  d=$(dirname "$1")
  while [ "$d" != "." ] && [ "$d" != "/" ] && [ ! -f "$d/pyproject.toml" ]; do
    d=$(dirname "$d")
  done
  if [ -f "$d/pyproject.toml" ]; then printf '%s\n' "$d"; fi
}

# Run one project's share of the staged files. Selection happens through the POSITIONAL parameters
# rather than a space-joined string: appending matches to "$@" and then shifting the originals off
# keeps each path a single argument, so a path containing a space stays one path instead of
# becoming two broken ones.
run_project() {
  project="$1"
  shift
  original=$#
  for f in "$@"; do
    if [ "$(project_of "$f")" = "$project" ]; then set -- "$@" "$f"; fi
  done
  shift "$original"
  [ "$#" -gt 0 ] || return 0

  # No --exit-non-zero-on-fix: this tier REPAIRS, it does not report. A violation ruff cannot fix
  # still exits non-zero and blocks the commit, which is the behaviour we want.
  if [ "$mode" = "check" ]; then
    uv run --project "$project" ruff check --fix "$@"
  else
    uv run --project "$project" ruff format "$@"
  fi
}

projects=$(for f in "$@"; do project_of "$f"; done | sort -u)
[ -n "$projects" ] || exit 0

status=0
for p in $projects; do
  run_project "$p" "$@" || status=$?
done
exit "$status"
