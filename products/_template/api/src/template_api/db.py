from collections.abc import Generator

from sqlalchemy import Engine
from sqlalchemy.pool import NullPool
from sqlmodel import Session, create_engine

from .settings import get_settings


def _make_engine(url: str) -> Engine:
    # Key ruling #4: runtime app traffic uses the TRANSACTION-mode pooler (6543) for
    # serverless-friendly autoscaling. Supavisor reassigns connections per-transaction, so it
    # does not reliably keep server-side prepared statements. psycopg v3 + prepare_threshold=None
    # disables them; NullPool means we don't double-pool on top of Supavisor. Session mode and
    # direct connections live on 5432 (NOT removed) but aren't used for runtime traffic; Alembic
    # uses the direct 5432 URL.
    return create_engine(
        url,
        poolclass=NullPool,
        connect_args={"prepare_threshold": None},
        echo=False,
    )


_engine: Engine | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = _make_engine(get_settings().database_url)
    return _engine


def get_session() -> Generator[Session]:
    """FastAPI dependency: one Session per request, committed/closed at the edge."""
    with Session(get_engine()) as session:
        yield session
