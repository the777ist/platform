import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text
from sqlmodel import Session, SQLModel, create_engine

from template_api.auth import get_current_user
from template_api.db import _make_engine, get_session  # pyright: ignore[reportPrivateUsage]
from template_api.main import create_app
from template_api.schemas.user import MeRead

# Real Postgres (Supabase local in dev; postgres service container in CI). NOT sqlite.
# tests/__init__.py resolves the URL + database name and exports the DATABASE_URL /
# DATABASE_MIGRATION_URL defaults — it must run first, because template_api.main reads
# Settings at import time. An explicit TEST_DATABASE_URL is respected verbatim there.
# Re-exported here so `from tests.conftest import TEST_DB_URL` keeps working.
from . import TEST_DB_NAME, TEST_DB_URL

TEST_OWNER = "11111111-1111-1111-1111-111111111111"


@pytest.fixture(scope="session")
def engine() -> Engine:
    if "TEST_DATABASE_URL" not in os.environ:
        # Default path (CI container or the product's own local stack): ensure the
        # per-product database exists. No cross-suite race — each product creates only
        # its OWN database name.
        admin = create_engine(
            TEST_DB_URL.rsplit("/", 1)[0] + "/postgres", isolation_level="AUTOCOMMIT"
        )
        with admin.connect() as conn:
            present = conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": TEST_DB_NAME}
            ).scalar()
            if present is None:
                conn.execute(text(f'CREATE DATABASE "{TEST_DB_NAME}"'))
        admin.dispose()
    # The APPLICATION's engine factory, not a second copy of its arguments. Repeating
    # poolclass/connect_args here meant the suite ran against a configuration that merely
    # happened to match production's — see tests/test_db_engine.py.
    eng = _make_engine(TEST_DB_URL)
    # drop_all FIRST: create_all skips tables that already exist and never ALTERs, so the
    # test database silently kept whatever schema the suite's FIRST-EVER run built. The first
    # migration after that, every test touching the changed table failed with UndefinedColumn
    # until someone hand-ran DROP DATABASE <module>_api_test — reproduced by dropping a column
    # from the test DB and watching 8 tests fail with no way for the suite to heal itself.
    # The test database is DISPOSABLE by contract (per-test savepoints already roll back all
    # data; TEST_DATABASE_URL must never point at a database anyone cares about — the suite
    # writes to it regardless), so rebuilding the schema per session costs milliseconds and
    # removes the whole failure class.
    SQLModel.metadata.drop_all(eng)
    SQLModel.metadata.create_all(
        eng
    )  # tests build the schema directly (no RLS needed in test role)
    return eng


@pytest.fixture
def session(engine: Engine) -> Generator[Session]:
    # Per-test transaction rollback: open a connection + outer transaction, bind the
    # Session to it, roll back at teardown so each test sees a clean DB. Never mock the session.
    #
    # CRITICAL (SQLAlchemy 2.0): services call self.session.commit(), and in 2.0 commit()
    # commits the OUTERMOST transaction — so without join_transaction_mode the service's
    # commit() would commit the outer `trans` the fixture means to roll back, the teardown
    # rollback would undo nothing, and rows would leak across tests (e.g. the 25-item cursor
    # test pollutes later tests). Binding with join_transaction_mode="create_savepoint" makes
    # each application-level commit() land on a SAVEPOINT inside the outer transaction, so the
    # outer rollback discards everything.
    connection = engine.connect()
    trans = connection.begin()
    with Session(bind=connection, join_transaction_mode="create_savepoint") as s:
        yield s
    trans.rollback()
    connection.close()


@pytest.fixture
def client(session: Session) -> Generator[TestClient]:
    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def auth_client(session: Session) -> Generator[TestClient]:
    # Override auth to a fixed test user so router tests don't need a real JWT.
    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[get_current_user] = lambda: MeRead(
        id=TEST_OWNER, email="t@example.com"
    )
    yield TestClient(app)
    app.dependency_overrides.clear()
