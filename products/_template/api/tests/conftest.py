import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine
from sqlalchemy.pool import NullPool
from sqlmodel import Session, SQLModel, create_engine

from template_api.auth import get_current_user
from template_api.db import get_session
from template_api.main import create_app
from template_api.schemas.user import MeRead

TEST_OWNER = "11111111-1111-1111-1111-111111111111"

# Real Postgres (Supabase local in dev; postgres service container in CI). NOT sqlite.
# (tests/__init__.py already exported DATABASE_URL/DATABASE_MIGRATION_URL defaults —
# template_api.main reads Settings at import time.)
TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://postgres:postgres@localhost:5432/postgres",
)


@pytest.fixture(scope="session")
def engine() -> Engine:
    eng = create_engine(TEST_DB_URL, poolclass=NullPool, connect_args={"prepare_threshold": None})
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
