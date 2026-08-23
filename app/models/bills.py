import enum
import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import CHAR, Boolean, Date, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.bill_line_items import BillLineItem
    from app.models.categories import Category
    from app.models.elicitations import Elicitation
    from app.models.users import User
    from app.models.vendors import Vendor


def _enum_values(enum_cls: type[enum.StrEnum]) -> list[str]:
    """Make SQLAlchemy store an enum's lowercase `.value` in Postgres, not its `.name`.

    `sqlalchemy.Enum` defaults to persisting the Python member *name* (e.g. "PENDING"), but the
    Postgres enum type created by the migration uses the lowercase values from /CLAUDE.md's enum
    decisions (e.g. "pending") - this callable bridges the two.
    """
    return [member.value for member in enum_cls]


class DocumentType(enum.StrEnum):
    INVOICE = "invoice"
    RECEIPT = "receipt"
    STATEMENT = "statement"
    UTILITY_BILL = "utility_bill"
    SUBSCRIPTION = "subscription"
    OTHER = "other"


class BillStatus(enum.StrEnum):
    PENDING = "pending"
    IN_REVIEW = "in_review"
    FLAGGED = "flagged"
    RESOLVED = "resolved"
    ARCHIVED = "archived"


class BillStage(enum.StrEnum):
    UPLOADED = "uploaded"
    PARSING = "parsing"
    CATEGORIZING = "categorizing"
    AUDITING = "auditing"
    COMPLETE = "complete"


class PaymentStatus(enum.StrEnum):
    UNPAID = "unpaid"
    PARTIAL = "partial"
    PAID = "paid"
    OVERDUE = "overdue"
    DISPUTED = "disputed"


class Bill(Base):
    __tablename__ = "bills"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    # Nullable: assigned by the categorizer/parser agents as the bill moves through
    # `current_stage`, not necessarily known at upload time.
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id"), nullable=True, index=True
    )
    vendor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("vendors.id"), nullable=True, index=True
    )
    # Nullable: identified by the parser, not necessarily known at upload time.
    document_type: Mapped[DocumentType | None] = mapped_column(
        SAEnum(DocumentType, name="bill_document_type", values_callable=_enum_values),
        nullable=True,
    )
    # The bill's own display name/title. Required at upload (e.g. defaults to the filename).
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # The remaining fields below (invoice_number through raw_text) are all values the parsing
    # agent extracts from the document, so none of them can be known at upload time -> nullable.
    invoice_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    vendor_name_raw: Mapped[str | None] = mapped_column(String(255), nullable=True)
    issue_date: Mapped[date | None] = mapped_column(Date(), nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date(), nullable=True)
    service_period_start: Mapped[date | None] = mapped_column(Date(), nullable=True)
    service_period_end: Mapped[date | None] = mapped_column(Date(), nullable=True)
    subtotal: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    tax_amount: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    total_amount: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    amount_due: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    # ISO-4217 currency code (e.g. "USD"); nullable until the parser determines it.
    currency: Mapped[str | None] = mapped_column(CHAR(3), nullable=True)
    payment_method: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[BillStatus] = mapped_column(
        SAEnum(BillStatus, name="bill_status", values_callable=_enum_values),
        default=BillStatus.PENDING,
        server_default=BillStatus.PENDING.value,
        nullable=False,
    )
    current_stage: Mapped[BillStage] = mapped_column(
        SAEnum(BillStage, name="bill_stage", values_callable=_enum_values),
        default=BillStage.UPLOADED,
        server_default=BillStage.UPLOADED.value,
        nullable=False,
    )
    payment_status: Mapped[PaymentStatus] = mapped_column(
        SAEnum(PaymentStatus, name="bill_payment_status", values_callable=_enum_values),
        default=PaymentStatus.UNPAID,
        server_default=PaymentStatus.UNPAID.value,
        nullable=False,
    )
    # Overall confidence/reasoning for the bill's current stage (see /CLAUDE.md's
    # `{result, confidence, reasoning}` convention) - nullable until an agent has run.
    # Distinct from field_confidences below, which is per-field granularity for later use.
    confidence: Mapped[float | None] = mapped_column(Numeric(4, 3), nullable=True)
    reasoning: Mapped[str | None] = mapped_column(Text(), nullable=True)
    # Per-field confidence scores recorded by the parsing/categorizing/auditing agents -
    # nullable until an agent has actually run.
    field_confidences: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    extraction_strategy: Mapped[str | None] = mapped_column(String(100), nullable=True)
    verified_by_user: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    raw_text: Mapped[str | None] = mapped_column(Text(), nullable=True)
    # Required at upload: the pointer to the stored file is the one thing guaranteed to exist
    # the moment a bill row is created.
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    # Required at upload: computed from the uploaded bytes for future dedup use. The ERD does
    # not mark this UK, so no uniqueness constraint is added here.
    file_hash: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
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
    category: Mapped["Category | None"] = relationship(back_populates="bills")
    vendor: Mapped["Vendor | None"] = relationship(back_populates="bills")
    line_items: Mapped[list["BillLineItem"]] = relationship(
        back_populates="bill", cascade="all, delete-orphan"
    )
    elicitations: Mapped[list["Elicitation"]] = relationship(
        back_populates="bill", cascade="all, delete-orphan"
    )
