"""add subcategories table

Revision ID: 26bae5ca947b
Revises: 3c06241c5fb7
Create Date: 2026-08-26 22:36:14.660370

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "26bae5ca947b"
down_revision: str | Sequence[str] | None = "3c06241c5fb7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "subcategories",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("category_id", sa.Uuid(), nullable=False),
        sa.Column("parent_subcategory_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(255), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"]),
        sa.ForeignKeyConstraint(["parent_subcategory_id"], ["subcategories.id"]),
        sa.PrimaryKeyConstraint("id"),
        # Scoped to (category_id, parent_subcategory_id, slug) rather than just
        # (category_id, slug): a level-2 "autre" under "Fruits" and a level-2 "autre" under
        # "Légumes" (both level-1 children of the same top-level category) must not collide.
        # category_id is itself already user-scoped (a category belongs to exactly one user),
        # so this transitively enforces per-user uniqueness too.
        sa.UniqueConstraint(
            "category_id",
            "parent_subcategory_id",
            "slug",
            name="uq_subcategories_category_id_parent_subcategory_id_slug",
        ),
    )
    op.create_index(op.f("ix_subcategories_user_id"), "subcategories", ["user_id"], unique=False)
    op.create_index(
        op.f("ix_subcategories_category_id"), "subcategories", ["category_id"], unique=False
    )
    op.create_index(
        op.f("ix_subcategories_parent_subcategory_id"),
        "subcategories",
        ["parent_subcategory_id"],
        unique=False,
    )
    # RLS enabled at table-creation time, not deferred - same pattern as
    # 28263f87489e_enable_row_level_security.py, but as its own migration since that one's
    # TABLES tuple is historical (this table didn't exist yet when it ran).
    op.execute("ALTER TABLE subcategories ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE subcategories FORCE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY subcategories_isolation ON subcategories
            USING (user_id = current_setting('app.current_user_id', true)::uuid)
            WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid)
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS subcategories_isolation ON subcategories")
    op.execute("ALTER TABLE subcategories NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE subcategories DISABLE ROW LEVEL SECURITY")
    op.drop_index(op.f("ix_subcategories_parent_subcategory_id"), table_name="subcategories")
    op.drop_index(op.f("ix_subcategories_category_id"), table_name="subcategories")
    op.drop_index(op.f("ix_subcategories_user_id"), table_name="subcategories")
    op.drop_table("subcategories")
