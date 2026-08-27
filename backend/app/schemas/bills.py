import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.bills import BillStage, BillStatus, DocumentType, PaymentStatus


def _validate_storage_key(value: str | None) -> str | None:
    """storage_key is always a flat, server-generated `{user_id}/{sha256}.pdf` identifier from
    storage.compute_storage_key - no file lives at this path (the original PDF is only ever
    read once, via a temp file, during the upload request itself - see storage.temp_pdf), but
    the same path-traversal-shaped values are still rejected defensively if a client sets this
    field directly via the plain CRUD endpoints."""
    if value is not None and (".." in value or "\\" in value or value.startswith("/")):
        raise ValueError("storage_key must not contain '..', '\\', or start with '/'")
    return value


class BillBase(BaseModel):
    category_id: uuid.UUID | None = None
    vendor_id: uuid.UUID | None = None
    document_type: DocumentType | None = None
    name: str = Field(min_length=1, max_length=255)
    invoice_number: str | None = Field(default=None, max_length=100)
    vendor_name_raw: str | None = Field(default=None, max_length=255)
    issue_date: date | None = None
    due_date: date | None = None
    service_period_start: date | None = None
    service_period_end: date | None = None
    subtotal: Decimal | None = None
    tax_amount: Decimal | None = None
    total_amount: Decimal | None = None
    amount_due: Decimal | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    payment_method: str | None = Field(default=None, max_length=100)
    status: BillStatus | None = None
    current_stage: BillStage | None = None
    payment_status: PaymentStatus | None = None
    confidence: Decimal | None = None
    reasoning: str | None = None
    field_confidences: dict | None = None
    extraction_strategy: str | None = Field(default=None, max_length=100)
    verified_by_user: bool | None = None
    raw_text: str | None = None


class BillCreate(BillBase):
    # These are the two values guaranteed to exist the moment a bill is uploaded; everything
    # else in BillBase is populated progressively by the parsing/categorizing/auditing agents.
    storage_key: str = Field(min_length=1, max_length=500)
    file_hash: str = Field(min_length=1, max_length=128)

    _validate_storage_key = field_validator("storage_key")(_validate_storage_key)


class BillUpdate(BillBase):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    storage_key: str | None = Field(default=None, min_length=1, max_length=500)
    file_hash: str | None = Field(default=None, min_length=1, max_length=128)

    _validate_storage_key = field_validator("storage_key")(_validate_storage_key)


class BillRead(BillBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    status: BillStatus
    current_stage: BillStage
    payment_status: PaymentStatus
    verified_by_user: bool
    storage_key: str
    file_hash: str
    created_at: datetime
    updated_at: datetime


class BillUploadResult(BaseModel):
    """One outcome per uploaded file - a batch upload never fails as a whole because one
    file was bad, so each file gets its own success/failure result."""

    filename: str
    bill: BillRead | None = None
    error: str | None = None
