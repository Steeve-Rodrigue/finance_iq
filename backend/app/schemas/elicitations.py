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
    """What the user submits to resolve a pending elicitation - plain text, e.g. "it's from
    Atelier du Bois, paid by card", not JSON. Turned into structured field corrections via
    an OpenRouter call - see app/services/bill_parser_service.py::parse_elicitation_answer."""

    answer_text: str = Field(min_length=1)


class ElicitationRead(ElicitationBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    bill_id: uuid.UUID
    status: ElicitationStatus
    created_at: datetime
    updated_at: datetime
