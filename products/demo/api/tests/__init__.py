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
