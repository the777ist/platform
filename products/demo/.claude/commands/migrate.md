Alembic migrations for this product's api (run from `api/`; schema changes ONLY via
Alembic — never `create_all`, never the Studio):

```bash
uv run alembic revision --autogenerate -m "<change>"   # then EDIT the generated file:
#  - every new table gets RLS deny-all: op.execute("ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;")
uv run alembic upgrade head                             # apply locally (direct 5432 URL)
```

Deploys apply migrations automatically: the Fly release_command runs
`alembic upgrade head` over `DATABASE_MIGRATION_URL` (direct 5432) before the new
machines take traffic.
