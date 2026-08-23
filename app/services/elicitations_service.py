import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.exceptions import ConflictError, NotFoundError
from app.models.elicitations import Elicitation
from app.repos import bills_repo, elicitations_repo

# CRUD baseline only. Deciding when to pause and elicit, formulating the question, and
# resuming the paused agent (merging an answer back into the bill) live in
# app/services/bill_parser_service.py (see parse_and_persist_bill's unresolved branch and
# resume_from_elicitation_answer) - this module only stores and retrieves elicitation records
# a caller already decided to create or answer.


async def list_elicitations(
    db: AsyncSession, user_id: uuid.UUID, bill_id: uuid.UUID
) -> list[Elicitation]:
    return await elicitations_repo.list_by_bill(db, user_id, bill_id)


async def get_elicitation(
    db: AsyncSession, user_id: uuid.UUID, bill_id: uuid.UUID, elicitation_id: uuid.UUID
) -> Elicitation:
    elicitation = await elicitations_repo.get_by_id(db, user_id, elicitation_id)
    if elicitation is None or elicitation.bill_id != bill_id:
        raise NotFoundError(f"elicitation {elicitation_id} not found")
    return elicitation


async def claim_pending_elicitation(
    db: AsyncSession, user_id: uuid.UUID, bill_id: uuid.UUID, elicitation_id: uuid.UUID
) -> Elicitation:
    """Atomically claims a PENDING elicitation (flips it to ANSWERED in one statement) so two
    concurrent/retried answer submissions can't both persist - see
    elicitations_repo.claim_pending. Raises ConflictError, not a silent no-op, if it's already
    been claimed or was never pending - the caller must not proceed with persistence either
    way."""
    elicitation = await elicitations_repo.claim_pending(db, user_id, bill_id, elicitation_id)
    if elicitation is None:
        raise ConflictError(f"elicitation {elicitation_id} is not pending")
    return elicitation


async def create_elicitation(
    db: AsyncSession,
    user_id: uuid.UUID,
    bill_id: uuid.UUID,
    stage: Any,
    question: str,
    **fields: Any,
) -> Elicitation:
    bill = await bills_repo.get_by_id(db, user_id, bill_id)
    if bill is None:
        raise NotFoundError(f"bill {bill_id} not found")
    elicitation = await elicitations_repo.create(
        db, user_id, bill_id, stage=stage, question=question, **fields
    )
    await db.commit()
    return elicitation


async def update_elicitation(
    db: AsyncSession,
    user_id: uuid.UUID,
    bill_id: uuid.UUID,
    elicitation_id: uuid.UUID,
    **fields: Any,
) -> Elicitation:
    await get_elicitation(db, user_id, bill_id, elicitation_id)
    elicitation = await elicitations_repo.update(db, user_id, elicitation_id, **fields)
    if elicitation is None:
        raise NotFoundError(f"elicitation {elicitation_id} not found")
    await db.commit()
    return elicitation


async def delete_elicitation(
    db: AsyncSession, user_id: uuid.UUID, bill_id: uuid.UUID, elicitation_id: uuid.UUID
) -> None:
    await get_elicitation(db, user_id, bill_id, elicitation_id)
    deleted = await elicitations_repo.delete(db, user_id, elicitation_id)
    if not deleted:
        raise NotFoundError(f"elicitation {elicitation_id} not found")
    await db.commit()
