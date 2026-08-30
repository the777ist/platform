# syntax=docker/dockerfile:1
# devbox/Dockerfile — the persistent cloud workstation image (see devbox/README.md).
#
# The split that makes stop/start-forever work: this IMAGE is the toolchain and is rebuilt on
# every `devbox deploy`; the VOLUME (mounted at /data by fly.toml) is the identity — HOME lives
# at /data/home/dev, so Claude auth, MCP OAuth tokens, gh auth, git config, repo clones, the
# pnpm store and docker's pulled images all survive stop/start AND redeploy. Nothing identity-
# shaped may be baked in here; nothing toolchain-shaped should live on the volume.

FROM debian:bookworm-slim AS devbox

ENV DEBIAN_FRONTEND=noninteractive

# Base tooling. build-essential because the repo's pnpm install compiles native deps; tini is
# PID 1 (reaps dockerd's orphans); sudo because this is a personal workstation, not a service.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git gnupg tmux tini sudo openssh-client \
    less procps unzip zip ripgrep jq build-essential locales \
    && sed -i 's/# en_US.UTF-8/en_US.UTF-8/' /etc/locale.gen && locale-gen
ENV LANG=en_US.UTF-8

# Docker Engine — Docker-IN-A-VM, not docker-in-docker gymnastics: a Fly Machine is a full
# Firecracker VM with its own kernel, so dockerd runs here exactly as on a laptop. It exists
# for ONE reason: `pnpm bootstrap` runs each product's `supabase start` compose stack, and the
# whole local-dev story of this repo (pytest against real Postgres, seeded stacks, offset
# ports) depends on it. dockerd's data-root is pointed at the volume by entrypoint.sh so
# pulled images survive redeploys.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" \
    > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# GitHub CLI — first-boot `gh auth login` lands its token under HOME (the volume).
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh

# Supabase CLI — deliberately here and not in mise.toml or any package.json: the root README
# lists it as a machine prerequisite (like Docker), scripts/bootstrap.mjs shells out to a bare
# `supabase`, and nothing in the JS/Python dependency universes owns it. Bump the ARG to
# upgrade; the .deb is the CLI team's supported Linux install.
ARG SUPABASE_CLI_VERSION=2.116.0
RUN curl -fsSL -o /tmp/supabase.deb \
    "https://github.com/supabase/cli/releases/download/v${SUPABASE_CLI_VERSION}/supabase_${SUPABASE_CLI_VERSION}_linux_amd64.deb" \
    && apt-get install -y /tmp/supabase.deb && rm /tmp/supabase.deb

# mise + the pinned toolchain, installed system-wide at BUILD time so `devbox up` never waits
# on toolchain downloads. The pins DUPLICATE the repo root's mise.toml on purpose: the image
# must be able to run Claude Code before any repo is cloned, and /etc/mise config is trusted
# by default (no absolute-path trust dance). Keep these in sync when mise.toml changes — the
# clone's own mise.toml re-resolves the same versions during `pnpm bootstrap` anyway, so drift
# costs a re-download at bootstrap, not a broken box.
RUN curl -fsSL https://mise.run | MISE_INSTALL_PATH=/usr/local/bin/mise sh
ENV MISE_DATA_DIR=/opt/mise
RUN mkdir -p /etc/mise && printf '%s\n' \
    '# Duplicates the repo mise.toml pins (see Dockerfile comment). Keep in sync.' \
    '[tools]' \
    'node = "24"' \
    'pnpm = "11"' \
    'python = "3.13"' \
    'uv = "latest"' \
    > /etc/mise/config.toml \
    && mise install && mise reshim
ENV PATH="/opt/mise/shims:${PATH}"

# Claude Code — the binary ships in the image (fresh on every deploy); everything it KNOWS
# (auth, MCP OAuth tokens, permissions, memory, ~/.claude.json) lives under HOME on the
# volume, which is the entire point of this machine.
RUN npm install -g @anthropic-ai/claude-code && mise reshim

# The human user. HOME points INTO the volume mount; --no-create-home because /data does not
# exist at build time — entrypoint.sh creates and seeds it on first boot. Root runs the
# container (dockerd requires it — a deliberate departure from the api Dockerfile's non-root
# stance, justified because nothing here serves traffic and the human needs sudo anyway);
# people land as `dev` via `devbox ssh`.
RUN groupadd -f docker \
    && useradd --uid 1000 --gid users --groups docker,sudo \
    --shell /bin/bash --home-dir /data/home/dev --no-create-home dev \
    && printf 'dev ALL=(ALL) NOPASSWD:ALL\n' > /etc/sudoers.d/dev \
    && chmod 440 /etc/sudoers.d/dev

# Login-shell wiring lives in the IMAGE, not the volume: whatever happens to the persisted
# ~/.bashrc over the years, a redeploy always repairs PATH and mise activation.
RUN printf '%s\n' \
    'export MISE_DATA_DIR=/opt/mise' \
    'export PATH="/opt/mise/shims:$PATH"' \
    'command -v mise >/dev/null 2>&1 && eval "$(mise activate bash)"' \
    > /etc/profile.d/devbox.sh

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
