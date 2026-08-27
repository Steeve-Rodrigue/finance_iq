"""add bill line items subcategory id

Revision ID: bf96b38cad3e
Revises: 26bae5ca947b
Create Date: 2026-08-26 22:36:18.747684

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "bf96b38cad3e"
down_revision: str | Sequence[str] | None = "26bae5ca947b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("bill_line_items", sa.Column("subcategory_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_bill_line_items_subcategory_id_subcategories",
        "bill_line_items",
        "subcategories",
        ["subcategory_id"],
        ["id"],
    )
    op.create_index(
        op.f("ix_bill_line_items_subcategory_id"),
        "bill_line_items",
        ["subcategory_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_bill_line_items_subcategory_id"), table_name="bill_line_items")
    op.drop_constraint(
        "fk_bill_line_items_subcategory_id_subcategories", "bill_line_items", type_="foreignkey"
    )
    op.drop_column("bill_line_items", "subcategory_id")
