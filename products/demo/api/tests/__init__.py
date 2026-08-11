"""Test package init — runs BEFORE conftest imports demo_api.main.

`demo_api.main` builds the app at module level (uvicorn entrypoint), which reads
Settings at import time — so the required DB URLs must exist in the environment before
any demo_api import happens.
"""

import json
import os
import pathlib

# WHERE the test Postgres lives when TEST_DATABASE_URL is not set explicitly.
# CI runs ONE `postgres:16` service container on :5432. Locally there is no such
# container: every product has its OWN Supabase stack on a portIndex offset (direct db
# port 54322 + 100·portIndex), and :5432 is at best nothing and at worst a FOREIGN
# Postgres — defaulting to it there silently creates the test database on an unrelated
# server and the suite passes GREEN against the wrong data. Resolved once here (this
# module is imported before conftest) and reused by conftest.
_PORT_INDEX = int(
    json.loads((pathlib.Path(__file__).resolve().parents[2] / "product.json").read_text())[
        "portIndex"
    ]
)
DB_HOST_PORT = (
    "localhost:5432" if os.environ.get("CI") else f"127.0.0.1:{54322 + 100 * _PORT_INDEX}"
)

_TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    f"postgresql+psycopg://postgres:postgres@{DB_HOST_PORT}/postgres",
)
os.environ.setdefault("DATABASE_URL", _TEST_DB_URL)
os.environ.setdefault("DATABASE_MIGRATION_URL", _TEST_DB_URL)
# Force-blank the broadcast credential (env vars BEAT .env in pydantic-settings):
# unit tests must never hit the real Realtime endpoint — broadcast_invalidate skips
# on a falsy key, and the dedicated realtime tests inject an httpx.MockTransport.
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""
