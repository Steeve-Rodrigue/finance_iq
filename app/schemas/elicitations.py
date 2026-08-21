import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.elicitations import ElicitationStage, ElicitationStatus


class ElicitationBase(BaseModel):
    stage: ElicitationStage
    question: str = Field(min_length=1)
    context: dict | None = None
    status: ElicitationStatus | None = None
    answer: dict | None = None
    answered_at: datetime | None = None


class ElicitationCreate(ElicitationBase):
    pass


class ElicitationUpdate(BaseModel):
    stage: ElicitationStage | None = None
    question: str | None = Field(default=None, min_length=1)
    context: dict | None = None
    status: ElicitationStatus | None = None
    answer: dict | None = None
    answered_at: datetime | None = None


class ElicitationAnswer(BaseModel):
    """What the user submits to resolve a pending elicitation - field corrections/confirmations
    merged into the parser's partial result, e.g. {"total_amount": 42.50}."""

    answer: dict


class ElicitationRead(ElicitationBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    bill_id: uuid.UUID
    status: ElicitationStatus
    created_at: datetime
    updated_at: datetime
