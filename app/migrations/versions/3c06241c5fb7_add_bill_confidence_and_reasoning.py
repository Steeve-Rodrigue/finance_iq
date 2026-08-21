"""add bill confidence and reasoning

Revision ID: 3c06241c5fb7
Revises: 28263f87489e
Create Date: 2026-08-20 21:30:21.501599

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "3c06241c5fb7"
down_revision: str | Sequence[str] | None = "28263f87489e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("bills", sa.Column("confidence", sa.Numeric(4, 3), nullable=True))
    op.add_column("bills", sa.Column("reasoning", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("bills", "reasoning")
    op.drop_column("bills", "confidence")
