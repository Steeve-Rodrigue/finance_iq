import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.bills import Bill
    from app.models.users import User


def _enum_values(enum_cls: type[enum.StrEnum]) -> list[str]:
    """Make SQLAlchemy store an enum's lowercase `.value` in Postgres, not its `.name`."""
    return [member.value for member in enum_cls]


class ElicitationStage(enum.StrEnum):
    PARSING = "parsing"
    CATEGORIZING = "categorizing"
    AUDITING = "auditing"


class ElicitationStatus(enum.StrEnum):
    PENDING = "pending"
    ANSWERED = "answered"
    EXPIRED = "expired"


class Elicitation(Base):
    __tablename__ = "elicitations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    bill_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bills.id"), nullable=False, index=True)
    stage: Mapped[ElicitationStage] = mapped_column(
        SAEnum(ElicitationStage, name="elicitation_stage", values_callable=_enum_values),
        nullable=False,
    )
    question: Mapped[str] = mapped_column(Text(), nullable=False)
    context: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[ElicitationStatus] = mapped_column(
        SAEnum(ElicitationStatus, name="elicitation_status", values_callable=_enum_values),
        default=ElicitationStatus.PENDING,
        server_default=ElicitationStatus.PENDING.value,
        nullable=False,
    )
    # Nullable: only populated once the user actually answers.
    answer: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship()
    bill: Mapped["Bill"] = relationship(back_populates="elicitations")
