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
COPY --from=builder /app /app
EXPOSE 8000
CMD ["uvicorn", "demo_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
