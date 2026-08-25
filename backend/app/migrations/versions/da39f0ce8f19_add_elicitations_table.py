"""add elicitations table

Revision ID: da39f0ce8f19
Revises: c6a8c264126e
Create Date: 2026-08-20 08:00:05.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "da39f0ce8f19"
down_revision: str | Sequence[str] | None = "c6a8c264126e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ENUM_TYPE_NAMES = ("elicitation_stage", "elicitation_status")


def upgrade() -> None:
    for enum_name, values in (
        ("elicitation_stage", ("parsing", "categorizing", "auditing")),
        ("elicitation_status", ("pending", "answered", "expired")),
    ):
        sa.Enum(*values, name=enum_name).create(op.get_bind(), checkfirst=True)

    op.create_table(
        "elicitations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("bill_id", sa.Uuid(), nullable=False),
        sa.Column(
            "stage",
            postgresql.ENUM(
                "parsing",
                "categorizing",
                "auditing",
                name="elicitation_stage",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("context", postgresql.JSONB(), nullable=True),
        sa.Column(
            "status",
            postgresql.ENUM(
                "pending",
                "answered",
                "expired",
                name="elicitation_status",
                create_type=False,
            ),
            server_default="pending",
            nullable=False,
        ),
        sa.Column("answer", postgresql.JSONB(), nullable=True),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_elicitations_user_id"), "elicitations", ["user_id"], unique=False)
    op.create_index(op.f("ix_elicitations_bill_id"), "elicitations", ["bill_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_elicitations_bill_id"), table_name="elicitations")
    op.drop_index(op.f("ix_elicitations_user_id"), table_name="elicitations")
    op.drop_table("elicitations")

    for enum_name in _ENUM_TYPE_NAMES:
        sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
