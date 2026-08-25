import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.exceptions import ConflictError, NotFoundError
from app.models.elicitations import ElicitationStage
from app.models.users import User
from app.schemas.elicitations import (
    ElicitationAnswer,
    ElicitationCreate,
    ElicitationRead,
    ElicitationUpdate,
)
from app.services import bill_parser_service, categorizer_service, elicitations_service

router = APIRouter(prefix="/bills/{bill_id}/elicitations", tags=["elicitations"])

# The generic CRUD routes below are a baseline (list/get/create/update/delete an Elicitation
# record directly). /{elicitation_id}/answer is the actual pause/resume entry point - dispatched
# by stage to whichever agent paused (bill_parser_service for PARSING,
# categorizer_service for CATEGORIZING) since each stage resumes into different persistence.

_RESUME_BY_STAGE = {
    ElicitationStage.PARSING: bill_parser_service.resume_from_elicitation_answer,
    ElicitationStage.CATEGORIZING: (
        categorizer_service.resume_categorization_from_elicitation_answer
    ),
}


@router.post("/{elicitation_id}/answer", response_model=ElicitationRead)
async def answer_elicitation(
    bill_id: uuid.UUID,
    elicitation_id: uuid.UUID,
    body: ElicitationAnswer,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ElicitationRead:
    try:
        elicitation = await elicitations_service.get_elicitation(
            db, current_user.id, bill_id, elicitation_id
        )
        resume = _RESUME_BY_STAGE[elicitation.stage]
        await resume(db, current_user.id, bill_id, elicitation_id, body.answer_text)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except RuntimeError as exc:
        # parse_elicitation_answer couldn't turn the reply into usable JSON - a 4xx the user
        # can act on (rephrase and retry), not an opaque 500.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"couldn't understand that answer, please rephrase: {exc}",
        ) from exc
    elicitation = await elicitations_service.get_elicitation(
        db, current_user.id, bill_id, elicitation_id
    )
    return ElicitationRead.model_validate(elicitation)


@router.post("/", response_model=ElicitationRead, status_code=status.HTTP_201_CREATED)
async def create_elicitation(
    bill_id: uuid.UUID,
    body: ElicitationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ElicitationRead:
    fields = body.model_dump(exclude={"stage", "question"}, exclude_unset=True)
    try:
        elicitation = await elicitations_service.create_elicitation(
            db, current_user.id, bill_id, stage=body.stage, question=body.question, **fields
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return ElicitationRead.model_validate(elicitation)


@router.get("/", response_model=list[ElicitationRead])
async def list_elicitations(
    bill_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ElicitationRead]:
    elicitations = await elicitations_service.list_elicitations(db, current_user.id, bill_id)
    return [ElicitationRead.model_validate(elicitation) for elicitation in elicitations]


@router.get("/{elicitation_id}", response_model=ElicitationRead)
async def get_elicitation(
    bill_id: uuid.UUID,
    elicitation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ElicitationRead:
    try:
        elicitation = await elicitations_service.get_elicitation(
            db, current_user.id, bill_id, elicitation_id
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return ElicitationRead.model_validate(elicitation)


@router.patch("/{elicitation_id}", response_model=ElicitationRead)
async def update_elicitation(
    bill_id: uuid.UUID,
    elicitation_id: uuid.UUID,
    body: ElicitationUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ElicitationRead:
    fields = body.model_dump(exclude_unset=True)
    try:
        elicitation = await elicitations_service.update_elicitation(
            db, current_user.id, bill_id, elicitation_id, **fields
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return ElicitationRead.model_validate(elicitation)


@router.delete("/{elicitation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_elicitation(
    bill_id: uuid.UUID,
    elicitation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await elicitations_service.delete_elicitation(db, current_user.id, bill_id, elicitation_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
