"""The runtime engine's settings are a production-only contract, and nothing exercised them.

Key ruling #4: app traffic goes over the Supabase TRANSACTION-mode pooler (6543). Supavisor
reassigns connections per transaction, so it does not reliably keep server-side prepared
statements — psycopg v3 issues them by default, and without `prepare_threshold=None` queries
start failing once the pooler moves a connection. `NullPool` matters for the same reason: pooling
on top of Supavisor's pooling is what exhausts the upstream.

Neither could break a test before this file existed. conftest.py built its OWN engine, repeating
the same two arguments rather than calling _make_engine, so the settings under test were a second
copy that happened to agree — and the local suite runs over the DIRECT 5432 connection, where
prepared statements work fine. Drop either argument and every test passes while production breaks
over the pooler.

Asserted through a REAL connection rather than by reading SQLAlchemy's internals: what matters is
the state of the driver connection the app ends up with, and the closure holding connect_args is
an implementation detail that moves between versions.
"""

from sqlalchemy.pool import NullPool

from template_api.db import _make_engine  # pyright: ignore[reportPrivateUsage]

from . import TEST_DB_URL


def test_prepared_statements_are_disabled_on_the_real_connection() -> None:
    engine = _make_engine(TEST_DB_URL)
    try:
        with engine.connect() as conn:
            raw = conn.connection.dbapi_connection
            # psycopg3 exposes this on the connection; None means "never prepare".
            assert getattr(raw, "prepare_threshold", "MISSING") is None
    finally:
        engine.dispose()


def test_the_engine_does_not_pool_on_top_of_supavisor() -> None:
    engine = _make_engine(TEST_DB_URL)
    try:
        assert isinstance(engine.pool, NullPool)
    finally:
        engine.dispose()


def test_the_driver_is_psycopg3() -> None:
    # prepare_threshold is a psycopg v3 concept. On psycopg2 the argument is silently ignored,
    # so the pooler contract above would quietly stop holding.
    engine = _make_engine(TEST_DB_URL)
    try:
        assert engine.dialect.driver == "psycopg"
    finally:
        engine.dispose()
