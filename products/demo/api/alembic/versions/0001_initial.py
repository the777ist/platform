"""initial: item + push_token tables, RLS deny-all on every table"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "item",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("title", sqlmodel.AutoString(length=200), nullable=False),
        sa.Column("description", sqlmodel.AutoString(length=2000), nullable=True),
        sa.Column("owner_id", sqlmodel.AutoString(), nullable=False),
    )
    op.create_index("ix_item_owner_id", "item", ["owner_id"])
    op.create_index("ix_item_title", "item", ["title"])

    op.create_table(
        "push_token",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("user_id", sqlmodel.AutoString(), nullable=False),
        sa.Column("device_id", sqlmodel.AutoString(length=200), nullable=False),
        sa.Column("expo_token", sqlmodel.AutoString(length=255), nullable=False),
        sa.UniqueConstraint("user_id", "device_id", name="uq_push_user_device"),
    )
    op.create_index("ix_push_token_user_id", "push_token", ["user_id"])

    # RLS DENY-ALL on every table (DB conventions + Realtime bullet). The API connects
    # with a privileged role that BYPASSES RLS; PostgREST/Realtime (anon/authenticated
    # roles) get nothing until a per-table policy is added where Realtime reads are wanted.
    for table in ("item", "push_token"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY;")
        # No CREATE POLICY -> default deny for non-bypassing roles.


def downgrade() -> None:
    op.drop_table("push_token")
    op.drop_table("item")
