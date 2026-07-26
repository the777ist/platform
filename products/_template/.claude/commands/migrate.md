Alembic migrations for this product's api (run from `api/`; schema changes ONLY via
Alembic — never `create_all`, never the Studio):

```bash
uv run alembic revision --autogenerate -m "<change>"   # then EDIT the generated file:
#  - every new table gets RLS deny-all: op.execute("ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;")
uv run alembic upgrade head                             # apply locally (DATABASE_MIGRATION_URL)
```

`DATABASE_MIGRATION_URL` is always a DIRECT (non-pooler) connection: on the LOCAL
stack that's the product's own db port (`db.port` in `supabase/config.toml` — the
local pooler is disabled, so runtime and migrations share it); on hosted Supabase
it's direct 5432 (runtime uses the 6543 transaction pooler instead).

Deploys apply migrations automatically: the Fly release_command runs
`alembic upgrade head` over `DATABASE_MIGRATION_URL` before the new machines take
traffic.
