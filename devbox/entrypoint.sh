#!/bin/sh
# devbox/entrypoint.sh — PID 1 (under tini) for the persistent workstation.
#
# Deliberately NO `set -e`: this process IS the machine. A transient failure that kills PID 1
# stops (or crash-loops) the box, taking the ssh path down with it — the one thing that must
# never happen, because ssh is also how you debug the failure. Every step is guarded and loud
# instead, and the hold loop at the bottom never exits on its own.
# POSIX sh only: scripts/lint-shell.mjs runs `sh -n` over every tracked *.sh.

echo "devbox: boot $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# --- 1. The volume ----------------------------------------------------------------------------
# /data is the fly.toml mount. If it is missing something is badly wrong with the machine
# config — say so on every channel, but STAY UP so `fly ssh console` still works.
if [ ! -d /data ]; then
  echo "devbox: FATAL — /data is not mounted; identity/persistence is OFF. Check fly.toml [mounts]." >&2
else
  # First boot only, guarded by a MARKER FILE rather than a directory test: the recursive
  # chown below is O(home) and a later HOME holds clones + caches measured in gigabytes —
  # re-running it on every boot would turn start-up from seconds into minutes.
  if [ ! -f /data/.devbox-initialized ]; then
    echo "devbox: first boot — initialising the volume"
    mkdir -p /data/home/dev /data/docker /data/log
    cp -a /etc/skel/. /data/home/dev/ 2>/dev/null || true
    chown -R dev:users /data/home/dev
    chmod 700 /data/home/dev
    touch /data/.devbox-initialized
  fi
  # Cheap, non-recursive: repairs top-level ownership if uid mapping ever shifts on a rebuild.
  chown dev:users /data/home/dev 2>/dev/null || true
  mkdir -p /data/docker /data/log
fi

# --- 2. dockerd -------------------------------------------------------------------------------
# data-root on the volume: the Supabase stack images (~1-2 GB per product) survive stop/start
# AND redeploy, so `pnpm bootstrap` after an image refresh is seconds, not a re-pull.
if [ -d /data ]; then
  dockerd --data-root /data/docker >>/data/log/dockerd.log 2>&1 &
  DOCKERD_PID=$!
  tries=0
  until docker info >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -ge 30 ]; then
      echo "devbox: WARNING — dockerd did not come up after 30s; Supabase stacks will not start." >&2
      echo "devbox:           see /data/log/dockerd.log; the machine stays up for debugging." >&2
      break
    fi
    sleep 1
  done
  if docker info >/dev/null 2>&1; then
    echo "devbox: dockerd ready (data-root /data/docker)"
  fi
else
  DOCKERD_PID=""
fi

# --- 3. Graceful stop -------------------------------------------------------------------------
# `fly machine stop` sends SIGTERM (fly.toml kill_timeout gives us 30s). Stop dockerd cleanly
# so container state on the volume is consistent, then exit 0 — a clean stop, not a crash.
shutdown_handler() {
  echo "devbox: SIGTERM — stopping dockerd and shutting down"
  if [ -n "$DOCKERD_PID" ]; then
    kill "$DOCKERD_PID" 2>/dev/null || true
    n=0
    while kill -0 "$DOCKERD_PID" 2>/dev/null && [ "$n" -lt 20 ]; do
      n=$((n + 1))
      sleep 1
    done
  fi
  exit 0
}
trap shutdown_handler TERM INT

# --- 4. Hold the machine up -------------------------------------------------------------------
# sleep runs in the BACKGROUND with a wait: a foreground sleep would delay the TERM trap by up
# to an hour, blowing straight past kill_timeout and turning every stop into a hard kill.
echo "devbox: ready — connect with 'node scripts/devbox.mjs ssh'"
while :; do
  sleep 3600 &
  wait $! || :
done
