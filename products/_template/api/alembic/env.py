from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel

from template_api.models import Item, PushToken  # noqa: F401  (register tables on metadata)
from template_api.settings import get_settings

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Key ruling #4: Alembic migrates over the DIRECT port (5432), NOT the pooler.
config.set_main_option("sqlalchemy.url", get_settings().database_migration_url)

target_metadata = SQLModel.metadata

# Migrations run against PRODUCTION as a Fly release_command, so a migration that queues behind a
# long-lived lock IS the outage: it blocks every reader and writer behind it while it waits.
# lock_timeout makes the migration the party that fails (retry the deploy) instead of the one that
# takes the table down; statement_timeout bounds a runaway backfill. Generous on purpose — the
# point is to fail instead of queueing forever, not to race the clock.
# scripts/check-migration-safety.mjs (squawk) enforces that generated migration SQL carries these.
LOCK_TIMEOUT = "SET lock_timeout = '5s'"
STATEMENT_TIMEOUT = "SET statement_timeout = '10min'"


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.execute(LOCK_TIMEOUT)
        context.execute(STATEMENT_TIMEOUT)
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        # Session-scoped GUCs (plain SET, not SET LOCAL), so they survive the COMMIT and govern
        # the migration transaction that follows. The commit is LOAD-BEARING: exec_driver_sql on
        # a fresh connection AUTOBEGINS a SQLAlchemy transaction, alembic sees an existing
        # transaction and assumes the caller owns it (so it never commits), and closing the
        # connection then ROLLS BACK every migration — an empty database that looks like a
        # successful deploy. tests/test_migration_rls.py is what catches that shape.
        connection.exec_driver_sql(LOCK_TIMEOUT)
        connection.exec_driver_sql(STATEMENT_TIMEOUT)
        connection.commit()
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
