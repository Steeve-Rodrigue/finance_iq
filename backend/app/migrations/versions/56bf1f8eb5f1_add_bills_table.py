"""add bills table

Revision ID: 56bf1f8eb5f1
Revises: 2dd42a63e99f
Create Date: 2026-08-20 08:00:02.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "56bf1f8eb5f1"
down_revision: str | Sequence[str] | None = "2dd42a63e99f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Postgres doesn't drop an enum type when the table using it is dropped - downgrade() has to
# drop each one explicitly.
_ENUM_TYPE_NAMES = ("bill_document_type", "bill_status", "bill_stage", "bill_payment_status")


def upgrade() -> None:
    # Enum types have to exist before the columns below reference them - create them
    # explicitly (with `create_type=False` on the columns) so each one is created exactly
    # once, rather than relying on SQLAlchemy's implicit per-column "create if missing"
    # behaviour.
    for enum_name, values in (
        (
            "bill_document_type",
            ("invoice", "receipt", "statement", "utility_bill", "subscription", "other"),
        ),
        ("bill_status", ("pending", "in_review", "flagged", "resolved", "archived")),
        ("bill_stage", ("uploaded", "parsing", "categorizing", "auditing", "complete")),
        ("bill_payment_status", ("unpaid", "partial", "paid", "overdue", "disputed")),
    ):
        sa.Enum(*values, name=enum_name).create(op.get_bind(), checkfirst=True)

    op.create_table(
        "bills",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("category_id", sa.Uuid(), nullable=True),
        sa.Column("vendor_id", sa.Uuid(), nullable=True),
        sa.Column(
            "document_type",
            postgresql.ENUM(
                "invoice",
                "receipt",
                "statement",
                "utility_bill",
                "subscription",
                "other",
                name="bill_document_type",
                create_type=False,
            ),
            nullable=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("invoice_number", sa.String(100), nullable=True),
        sa.Column("vendor_name_raw", sa.String(255), nullable=True),
        sa.Column("issue_date", sa.Date(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("service_period_start", sa.Date(), nullable=True),
        sa.Column("service_period_end", sa.Date(), nullable=True),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=True),
        sa.Column("tax_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("total_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("amount_due", sa.Numeric(12, 2), nullable=True),
        sa.Column("currency", sa.CHAR(3), nullable=True),
        sa.Column("payment_method", sa.String(100), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM(
                "pending",
                "in_review",
                "flagged",
                "resolved",
                "archived",
                name="bill_status",
                create_type=False,
            ),
            server_default="pending",
            nullable=False,
        ),
        sa.Column(
            "current_stage",
            postgresql.ENUM(
                "uploaded",
                "parsing",
                "categorizing",
                "auditing",
                "complete",
                name="bill_stage",
                create_type=False,
            ),
            server_default="uploaded",
            nullable=False,
        ),
        sa.Column(
            "payment_status",
            postgresql.ENUM(
                "unpaid",
                "partial",
                "paid",
                "overdue",
                "disputed",
                name="bill_payment_status",
                create_type=False,
            ),
            server_default="unpaid",
            nullable=False,
        ),
        sa.Column("field_confidences", postgresql.JSONB(), nullable=True),
        sa.Column("extraction_strategy", sa.String(100), nullable=True),
        sa.Column(
            "verified_by_user", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column("raw_text", sa.Text(), nullable=True),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("file_hash", sa.String(128), nullable=False),
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
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_bills_user_id"), "bills", ["user_id"], unique=False)
    op.create_index(op.f("ix_bills_category_id"), "bills", ["category_id"], unique=False)
    op.create_index(op.f("ix_bills_vendor_id"), "bills", ["vendor_id"], unique=False)
    op.create_index(op.f("ix_bills_file_hash"), "bills", ["file_hash"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_bills_file_hash"), table_name="bills")
    op.drop_index(op.f("ix_bills_vendor_id"), table_name="bills")
    op.drop_index(op.f("ix_bills_category_id"), table_name="bills")
    op.drop_index(op.f("ix_bills_user_id"), table_name="bills")
    op.drop_table("bills")

    for enum_name in _ENUM_TYPE_NAMES:
        sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
