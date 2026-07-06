"""The ONE test that runs the real Alembic migration (guide Step 23, resolved item).

`SQLModel.metadata.create_all` (used by the other tests) silently skips the raw
`ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY` statements — the migration's most
important effect — so this test applies `alembic upgrade head` to a dedicated throwaway
database and asserts `relrowsecurity`/`relforcerowsecurity` are true for every table.
"""

import os
from collections.abc import Generator

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from tests.conftest import TEST_DB_URL

# Concatenated so the product token stays a whole word — the new-product generator's
# whole-word rewrite cannot rewrite a token embedded in a longer identifier, and a
# stamped product reusing this scratch-DB name collides on CI's single shared Postgres.
RLS_DB = "demo_api" + "_rls_test"


@pytest.fixture
def rls_db_url() -> Generator[str]:
    admin = create_engine(TEST_DB_URL, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f"DROP DATABASE IF EXISTS {RLS_DB}"))
        conn.execute(text(f"CREATE DATABASE {RLS_DB}"))
    url = TEST_DB_URL.rsplit("/", 1)[0] + f"/{RLS_DB}"
    yield url
    with admin.connect() as conn:
        conn.execute(text(f"DROP DATABASE IF EXISTS {RLS_DB} WITH (FORCE)"))
    admin.dispose()


def test_alembic_migration_applies_rls_deny_all(rls_db_url: str) -> None:
    # env.py reads DATABASE_MIGRATION_URL via get_settings() — point it at the throwaway DB.
    os.environ["DATABASE_URL"] = rls_db_url
    os.environ["DATABASE_MIGRATION_URL"] = rls_db_url
    from demo_api.settings import get_settings

    get_settings.cache_clear()
    try:
        command.upgrade(Config("alembic.ini"), "head")
        eng = create_engine(rls_db_url)
        with eng.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT relname, relrowsecurity, relforcerowsecurity "
                    "FROM pg_class WHERE relname IN ('item', 'push_token')"
                )
            ).all()
        eng.dispose()
        assert len(rows) == 2
        for relname, rls, force_rls in rows:
            assert rls is True, f"RLS not enabled on {relname}"
            assert force_rls is True, f"FORCE RLS not enabled on {relname}"
    finally:
        get_settings.cache_clear()
