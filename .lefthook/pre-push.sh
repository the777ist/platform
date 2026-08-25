#!/bin/sh
# .lefthook/pre-push.sh — derive the push's diff base from the refs git hands us, then run the
# gate. Run it by hand with:  sh .lefthook/pre-push.sh </dev/null
#
# git feeds a pre-push hook one line per ref on STDIN:
#   <local ref> <local sha> <remote ref> <remote sha>
# The REMOTE sha is the exact diff base we want — it is what the remote already has, which is
# precisely the set of commits CI is about to see for the first time. Scoping --affected to it
# (instead of letting turbo guess a base) is the difference between gating what you are pushing
# and gating everything since main.
#
# `exec < /dev/null` must come AFTER the read: detaching stdin first — the usual opening line of
# a hook — throws the refs away and the scoping becomes impossible.
set -eu

DEFAULT_BASE=origin/main
ALL=__ALL__ # sentinel: "cannot scope — gate EVERY package"
base=""
src=""
saw_ref=0
nrefs=0

# git marks "no such ref" with an all-zero sha. Matched by SHAPE rather than against a 40-zero
# constant, because a SHA-256 repository uses 64 zeros — a hardcoded 40 would silently stop
# recognising deletions and new branches there.
is_zero_sha() {
  case "$1" in
    "") return 1 ;;
    *[!0]*) return 1 ;;
    *) return 0 ;;
  esac
}

while read -r _lref lsha _rref rsha; do
  saw_ref=1
  # Branch deletion — there is no content to gate.
  if is_zero_sha "$lsha"; then continue; fi
  nrefs=$((nrefs + 1))
  if is_zero_sha "$rsha" || ! git cat-file -e "${rsha}^{commit}" 2>/dev/null; then
    # New branch (or a remote sha this clone does not have): diff against the trunk.
    base="$DEFAULT_BASE"
    src="new branch -> $DEFAULT_BASE"
  else
    base="$rsha"
    src="pushed refs (stdin)"
  fi
done

exec </dev/null # refs are read; detach so child processes cannot swallow stdin or hang

# Refs were read and every one of them was a deletion: there is no content to gate.
if [ -z "$base" ] && [ "$saw_ref" = "1" ]; then
  echo "pre-push: branch deletion only — nothing to gate"
  exit 0
fi

# More than one ref in a single push (`git push --all`, a branch plus a tag, several branches at
# once): the loop can only carry ONE base, and scoping to whichever ref happened to come last would
# leave every other ref's commits ungated. Widen instead.
if [ "$nrefs" -gt 1 ]; then
  base="$ALL"
  src="$nrefs refs pushed at once — cannot scope to a single range"
fi

# Fallback chain, reached only when NO ref line arrived (the job's `use_stdin: true` missing, or a
# lefthook that does not forward it). That means "could not scope", NOT "nothing to push" — so fail
# toward a WIDER base rather than skipping the gate.
if [ "$base" != "$ALL" ]; then
  if [ -z "$base" ]; then
    base=$(git rev-parse --verify --quiet '@{upstream}' 2>/dev/null || true)
    if [ -n "$base" ]; then src="@{upstream} fallback (stdin was empty)"; fi
  fi
  if [ -z "$base" ] || ! git rev-parse --verify --quiet "${base}^{commit}" >/dev/null 2>&1; then
    base="$DEFAULT_BASE"
    src="$DEFAULT_BASE fallback"
  fi
  # Still unusable — a fork whose default branch is not `main`, a remote that is not `origin`, a
  # clone that has never fetched. Gate EVERY package rather than exiting 0: a gate that cannot
  # scope must run more, never nothing. (This used to `exit 0`, i.e. skip silently.)
  if ! git rev-parse --verify --quiet "${base}^{commit}" >/dev/null 2>&1; then
    base="$ALL"
    src="no usable diff base (tried stdin refs, @{upstream}, $DEFAULT_BASE)"
  fi
fi

echo "pre-push: diff base $base [$src]"
exec node scripts/pre-push.mjs "$base"
