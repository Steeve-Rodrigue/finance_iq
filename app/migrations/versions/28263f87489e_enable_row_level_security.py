"""enable row level security

Revision ID: 28263f87489e
Revises: da39f0ce8f19
Create Date: 2026-08-20 07:22:36.556014

"""

from collections.abc import Sequence

from alembic import op

revision: str = "28263f87489e"
down_revision: str | Sequence[str] | None = "da39f0ce8f19"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# users is deliberately excluded: it has no user_id column (it IS the tenant), and signup
# has to insert a row before any app.current_user_id session var could ever be set.
TABLES = ("categories", "vendors", "bills", "bill_line_items", "elicitations")


def upgrade() -> None:
    for table in TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        # FORCE so even a table owner would be subject to RLS - defense in depth on top of
        # the app connecting as a non-owner, non-superuser role that can't bypass it anyway.
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY {table}_isolation ON {table}
                USING (user_id = current_setting('app.current_user_id', true)::uuid)
                WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid)
            """
        )


def downgrade() -> None:
    for table in TABLES:
        op.execute(f"DROP POLICY IF EXISTS {table}_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} NO FORCE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
