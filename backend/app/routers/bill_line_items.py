import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.exceptions import NotFoundError
from app.models.users import User
from app.schemas.bill_line_items import (
    BillLineItemCreate,
    BillLineItemRead,
    BillLineItemUpdate,
)
from app.services import bill_line_items_service

router = APIRouter(prefix="/bills/{bill_id}/line-items", tags=["bill-line-items"])


@router.post("/", response_model=BillLineItemRead, status_code=status.HTTP_201_CREATED)
async def create_line_item(
    bill_id: uuid.UUID,
    body: BillLineItemCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BillLineItemRead:
    fields = body.model_dump(exclude={"description", "line_total"})
    try:
        line_item = await bill_line_items_service.create_line_item(
            db,
            current_user.id,
            bill_id,
            description=body.description,
            line_total=body.line_total,
            **fields,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return BillLineItemRead.model_validate(line_item)


@router.get("/", response_model=list[BillLineItemRead])
async def list_line_items(
    bill_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[BillLineItemRead]:
    line_items = await bill_line_items_service.list_line_items(db, current_user.id, bill_id)
    return [BillLineItemRead.model_validate(line_item) for line_item in line_items]


@router.get("/{line_item_id}", response_model=BillLineItemRead)
async def get_line_item(
    bill_id: uuid.UUID,
    line_item_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BillLineItemRead:
    try:
        line_item = await bill_line_items_service.get_line_item(
            db, current_user.id, bill_id, line_item_id
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return BillLineItemRead.model_validate(line_item)


@router.patch("/{line_item_id}", response_model=BillLineItemRead)
async def update_line_item(
    bill_id: uuid.UUID,
    line_item_id: uuid.UUID,
    body: BillLineItemUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BillLineItemRead:
    fields = body.model_dump(exclude_unset=True)
    try:
        line_item = await bill_line_items_service.update_line_item(
            db, current_user.id, bill_id, line_item_id, **fields
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return BillLineItemRead.model_validate(line_item)


@router.delete("/{line_item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_line_item(
    bill_id: uuid.UUID,
    line_item_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await bill_line_items_service.delete_line_item(db, current_user.id, bill_id, line_item_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
