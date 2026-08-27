# syntax=docker/dockerfile:1

FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS builder
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev
COPY . .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

FROM python:3.13-slim-bookworm AS runtime
WORKDIR /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1
# Run as a NON-ROOT user. Nothing here needs root: the venv is read-only at runtime, uvicorn
# binds 8000 (unprivileged), and Alembic's release_command only talks to Postgres. Without this
# a bug that reaches the shell reaches it as root, which is the opposite of the posture the rest
# of the stack takes (RLS deny-all, least-privilege GITHUB_TOKEN, no service key on the client).
RUN useradd --system --uid 10001 --create-home app
COPY --from=builder --chown=app:app /app /app
USER app
EXPOSE 8000
CMD ["uvicorn", "template_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
