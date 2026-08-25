import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class BillLineItemBase(BaseModel):
    category_id: uuid.UUID | None = None
    description: str = Field(min_length=1, max_length=500)
    common_name: str | None = Field(default=None, max_length=255)
    quantity: Decimal | None = None
    unit_price: Decimal | None = None
    line_total: Decimal


class BillLineItemCreate(BillLineItemBase):
    pass


class BillLineItemUpdate(BaseModel):
    category_id: uuid.UUID | None = None
    description: str | None = Field(default=None, min_length=1, max_length=500)
    common_name: str | None = Field(default=None, max_length=255)
    quantity: Decimal | None = None
    unit_price: Decimal | None = None
    line_total: Decimal | None = None


class BillLineItemRead(BillLineItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    bill_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
