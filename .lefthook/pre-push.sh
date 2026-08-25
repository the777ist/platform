#!/bin/sh
# .lefthook/pre-push.sh — derive the push's diff base from the refs git hands us, then run the
# gate. Run it by hand with:  echo "" | sh .lefthook/pre-push.sh
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

ZERO=0000000000000000000000000000000000000000
DEFAULT_BASE=origin/main
base=""
src=""
saw_ref=0

while read -r _lref lsha _rref rsha; do
  saw_ref=1
  # Branch deletion — there is no content to gate.
  if [ "$lsha" = "$ZERO" ]; then continue; fi
  if [ "$rsha" = "$ZERO" ] || ! git cat-file -e "${rsha}^{commit}" 2>/dev/null; then
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

# Fallback chain, reached only when NO ref line arrived (the job's `use_stdin: true` missing, or a
# lefthook that does not forward it). That means "could not scope", NOT "nothing to push" — so fail
# CLOSED to a wider base rather than skipping the gate entirely.
if [ -z "$base" ]; then
  base=$(git rev-parse --verify --quiet '@{upstream}' 2>/dev/null || true)
  if [ -n "$base" ]; then src="@{upstream} fallback (stdin was empty)"; fi
fi
if [ -z "$base" ] || ! git rev-parse --verify --quiet "${base}^{commit}" >/dev/null 2>&1; then
  base="$DEFAULT_BASE"
  src="$DEFAULT_BASE fallback"
fi
if ! git rev-parse --verify --quiet "${base}^{commit}" >/dev/null 2>&1; then
  echo "pre-push: no usable diff base (tried stdin refs, @{upstream}, $DEFAULT_BASE) — skipping" >&2
  exit 0
fi

echo "pre-push: diff base $base [$src]"
exec node scripts/pre-push.mjs "$base"
