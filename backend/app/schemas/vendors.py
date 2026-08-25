import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class VendorBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    address: str | None = Field(default=None, max_length=500)
    key: str = Field(min_length=1, max_length=255)


class VendorCreate(VendorBase):
    pass


class VendorUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    address: str | None = Field(default=None, max_length=500)
    key: str | None = Field(default=None, min_length=1, max_length=255)


class VendorRead(VendorBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
