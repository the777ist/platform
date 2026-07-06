"""Test package init — runs BEFORE conftest imports demo_api.main.

`demo_api.main` builds the app at module level (uvicorn entrypoint), which reads
Settings at import time — so the required DB URLs must exist in the environment before
any demo_api import happens.
"""

import os

_TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@localhost:5432/postgres",
)
os.environ.setdefault("DATABASE_URL", _TEST_DB_URL)
os.environ.setdefault("DATABASE_MIGRATION_URL", _TEST_DB_URL)
# Force-blank the broadcast credential (env vars BEAT .env in pydantic-settings):
# unit tests must never hit the real Realtime endpoint — broadcast_invalidate skips
# on a falsy key, and the dedicated realtime tests inject an httpx.MockTransport.
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = ""
