import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.elicitations import Elicitation, ElicitationStatus


async def list_by_bill(
    db: AsyncSession, user_id: uuid.UUID, bill_id: uuid.UUID
) -> list[Elicitation]:
    result = await db.execute(
        select(Elicitation).where(Elicitation.user_id == user_id, Elicitation.bill_id == bill_id)
    )
    return list(result.scalars().all())


async def get_by_id(
    db: AsyncSession, user_id: uuid.UUID, elicitation_id: uuid.UUID
) -> Elicitation | None:
    result = await db.execute(
        select(Elicitation).where(Elicitation.user_id == user_id, Elicitation.id == elicitation_id)
    )
    return result.scalar_one_or_none()


async def create(
    db: AsyncSession,
    user_id: uuid.UUID,
    bill_id: uuid.UUID,
    stage: Any,
    question: str,
    **fields: Any,
) -> Elicitation:
    elicitation = Elicitation(
        user_id=user_id, bill_id=bill_id, stage=stage, question=question, **fields
    )
    db.add(elicitation)
    await db.flush()
    await db.refresh(elicitation)
    return elicitation


async def claim_pending(
    db: AsyncSession, user_id: uuid.UUID, bill_id: uuid.UUID, elicitation_id: uuid.UUID
) -> Elicitation | None:
    """Atomically flip PENDING -> ANSWERED (a single `UPDATE ... WHERE status = 'pending'`,
    not a read-then-write) so two concurrent/retried answer submissions can't both pass a
    plain status check and both go on to persist - only one can ever win this claim. Returns
    the claimed row, or None if it was already claimed (or never pending) - the caller should
    treat None as "someone else got there first", not silently proceed."""
    result = await db.execute(
        sa_update(Elicitation)
        .where(
            Elicitation.id == elicitation_id,
            Elicitation.user_id == user_id,
            Elicitation.bill_id == bill_id,
            Elicitation.status == ElicitationStatus.PENDING,
        )
        .values(status=ElicitationStatus.ANSWERED, answered_at=datetime.now(UTC))
        .returning(Elicitation)
    )
    await db.flush()
    return result.scalar_one_or_none()


async def update(
    db: AsyncSession, user_id: uuid.UUID, elicitation_id: uuid.UUID, **fields: Any
) -> Elicitation | None:
    elicitation = await get_by_id(db, user_id, elicitation_id)
    if elicitation is None:
        return None
    for key, value in fields.items():
        setattr(elicitation, key, value)
    await db.flush()
    await db.refresh(elicitation)
    return elicitation


async def delete(db: AsyncSession, user_id: uuid.UUID, elicitation_id: uuid.UUID) -> bool:
    elicitation = await get_by_id(db, user_id, elicitation_id)
    if elicitation is None:
        return False
    await db.delete(elicitation)
    await db.flush()
    return True
