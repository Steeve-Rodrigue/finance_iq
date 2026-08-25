"""add bill_line_items table

Revision ID: c6a8c264126e
Revises: 56bf1f8eb5f1
Create Date: 2026-08-20 08:00:03.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c6a8c264126e"
down_revision: str | Sequence[str] | None = "56bf1f8eb5f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "bill_line_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("bill_id", sa.Uuid(), nullable=False),
        sa.Column("category_id", sa.Uuid(), nullable=True),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("common_name", sa.String(255), nullable=True),
        sa.Column("quantity", sa.Numeric(12, 3), nullable=True),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=True),
        sa.Column("line_total", sa.Numeric(12, 2), nullable=False),
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
        sa.ForeignKeyConstraint(["bill_id"], ["bills.id"]),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_bill_line_items_user_id"), "bill_line_items", ["user_id"], unique=False
    )
    op.create_index(
        op.f("ix_bill_line_items_bill_id"), "bill_line_items", ["bill_id"], unique=False
    )
    op.create_index(
        op.f("ix_bill_line_items_category_id"), "bill_line_items", ["category_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_bill_line_items_category_id"), table_name="bill_line_items")
    op.drop_index(op.f("ix_bill_line_items_bill_id"), table_name="bill_line_items")
    op.drop_index(op.f("ix_bill_line_items_user_id"), table_name="bill_line_items")
    op.drop_table("bill_line_items")
