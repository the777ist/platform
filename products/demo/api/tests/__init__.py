"""Test package init — runs BEFORE conftest imports demo_api.main.

`demo_api.main` builds the app at module level (uvicorn entrypoint), which reads
Settings at import time — so the required DB URLs must exist in the environment before
any demo_api import happens.
"""

import os
import pathlib
import tomllib


# WHERE the test Postgres lives when TEST_DATABASE_URL is not set explicitly.
# CI runs ONE `postgres:16` service container on :5432. Locally there is no such
# container — each product's Postgres is its own Supabase stack — so read the port the
# CLI actually listens on out of that stack's config rather than re-deriving it from
# portIndex (the 54322+100·i formula already lives in config.toml, the api dev script
# and the generator; a fourth copy is a fourth thing to drift). Defaulting to a bare
# :5432 locally is either nothing or a FOREIGN Postgres — the suite would create its
# database on an unrelated server and pass GREEN against the wrong data.
def _db_host_port() -> str:
    if os.environ.get("CI"):
        return "localhost:5432"
    config = pathlib.Path(__file__).resolve().parents[2] / "supabase" / "config.toml"
    with config.open("rb") as f:
        return f"127.0.0.1:{tomllib.load(f)['db']['port']}"


DB_HOST_PORT = _db_host_port()

# Per-product database: in CI every product's suite shares the one container and turbo
# runs them in parallel, so a SHARED database races on the pg_type catalog (UniqueViolation
# on pg_type_typname_nsp_index). Concatenated so the product token stays a WHOLE WORD for
# the generator's rewrite (same reason as RLS_DB in test_migration_rls).
TEST_DB_NAME = "demo_api" + "_test"
TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    f"postgresql+psycopg://postgres:postgres@{DB_HOST_PORT}/{TEST_DB_NAME}",
)

# The app's Settings resolve at import time; point them at the SAME database the fixtures
# use. Every client fixture overrides get_session so the app's own engine never connects —
# but it must not be aimed at the product's real dev database either.
os.environ.setdefault("DATABASE_URL", TEST_DB_URL)
os.environ.setdefault("DATABASE_MIGRATION_URL", TEST_DB_URL)
# Force-blank the broadcast credential (env vars BEAT .env in pydantic-settings):
# unit tests must never hit the real Realtime endpoint — broadcast_invalidate skips
# on a falsy key, and the dedicated realtime tests inject an httpx.MockTransport.
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""
