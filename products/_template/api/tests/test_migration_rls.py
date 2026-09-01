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
RLS_DB = "template_api" + "_rls_test"


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
    from template_api.settings import get_settings

    get_settings.cache_clear()
    try:
        command.upgrade(Config("alembic.ini"), "head")
        eng = create_engine(rls_db_url)
        with eng.connect() as conn:
            # EVERY user table, discovered from the catalogue — never a hardcoded list.
            #
            # This used to assert `relname IN ('item', 'push_token')`, which pinned the locked
            # invariant ("tables stay RLS-deny-all") to the two tables the template
            # happens to ship. A product adding a third table got no coverage for it at all,
            # and every product stamped from this template inherited that hole — the
            # failure being an openly readable table on a public-facing database, which
            # nothing else would report.
            #
            # alembic_version is excluded deliberately: it is Alembic's own bookkeeping, not
            # application data, and FORCE RLS on it would lock Alembic out of its own table.
            rows = conn.execute(
                text(
                    "SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity "
                    "FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
                    "WHERE n.nspname = 'public' AND c.relkind = 'r' "
                    "AND c.relname <> 'alembic_version' "
                    "ORDER BY c.relname"
                )
            ).all()
        eng.dispose()

        names = {str(row[0]) for row in rows}
        # Without this the test passes VACUOUSLY: a query that matches nothing satisfies a loop
        # over its rows, so a migration that failed to create the tables, or a catalogue filter
        # that quietly stopped matching, would read as "every table is protected".
        assert {"item", "push_token"} <= names, f"expected the stamped tables, got {names}"

        for relname, rls, force_rls in rows:
            assert rls is True, f"RLS not enabled on {relname}"
            assert force_rls is True, f"FORCE RLS not enabled on {relname}"
    finally:
        get_settings.cache_clear()


def test_alembic_migrates_over_the_MIGRATION_url_not_the_pooler(rls_db_url: str) -> None:
    """Key ruling #4: Alembic runs over the DIRECT 5432 connection (DATABASE_MIGRATION_URL),
    never the Supabase pooler (6543, transaction mode) that serves runtime traffic.

    Nothing could tell the two apart. tests/__init__.py sets DATABASE_URL and
    DATABASE_MIGRATION_URL to the SAME value, so env.py reading either one passed every test —
    verified by pointing it at `database_url` and watching the whole suite stay green. In
    production that is DDL over a transaction pooler, which fails, and it fails inside the Fly
    release_command: mid-deploy, on the one path that has no local equivalent.

    So the two are given DIFFERENT values here, and only the migration one is real. If env.py
    ever reads the runtime URL again, this cannot connect.
    """
    os.environ["DATABASE_MIGRATION_URL"] = rls_db_url
    os.environ["DATABASE_URL"] = (
        # connect_timeout keeps the FAILURE fast: without it a wrong url leaves this test
        # hanging on a connect retry for minutes, which is how a red test gets ignored.
        "postgresql+psycopg://nobody:nobody@127.0.0.1:1/unreachable?connect_timeout=1"
    )
    from template_api.settings import get_settings

    get_settings.cache_clear()
    try:
        # Succeeds only by using DATABASE_MIGRATION_URL; the runtime URL points nowhere.
        command.upgrade(Config("alembic.ini"), "head")
    finally:
        os.environ["DATABASE_URL"] = rls_db_url
        get_settings.cache_clear()


def test_autogenerate_is_clean_after_migrating(rls_db_url: str) -> None:
    """`alembic check` against a freshly migrated database: the model metadata and the
    migration chain must agree EXACTLY, or every future `alembic revision --autogenerate`
    emits spurious ops (nullable alters, redundant indexes) that someone eventually commits.

    That drift existed and was found by hand: 0001 omitted nullable=False on the timestamp
    columns and the model base carried a redundant index=True on the primary key, so every
    autogen on every stamped product proposed the same noise. This pins the fix.
    """
    os.environ["DATABASE_URL"] = rls_db_url
    os.environ["DATABASE_MIGRATION_URL"] = rls_db_url
    from template_api.settings import get_settings

    get_settings.cache_clear()
    try:
        config = Config("alembic.ini")
        command.upgrade(config, "head")
        # Raises AutogenerateDiffsDetected when metadata and schema disagree.
        command.check(config)
    finally:
        get_settings.cache_clear()
