import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.exceptions import NotFoundError
from app.models.users import User
from app.repos.analytics.line_items_repo import LineItemFilters
from app.schemas.analytics.line_items import (
    CategoryTreeResponse,
    LineItemsAnalyticsResponse,
    SubcategoryLineItemRow,
)
from app.services.analytics import line_items_service

router = APIRouter()


@router.get("/line-items", response_model=LineItemsAnalyticsResponse)
async def get_line_items_analytics(
    vendor_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LineItemsAnalyticsResponse:
    filters = LineItemFilters(vendor_id=vendor_id, category_id=category_id)
    return await line_items_service.get_line_items_analytics(db, current_user.id, filters)


@router.get("/line-items/category-tree", response_model=CategoryTreeResponse)
async def get_category_tree(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CategoryTreeResponse:
    return await line_items_service.get_category_tree(db, current_user.id)


@router.get(
    "/line-items/by-subcategory/{subcategory_id}", response_model=list[SubcategoryLineItemRow]
)
async def get_line_items_for_subcategory(
    subcategory_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SubcategoryLineItemRow]:
    try:
        return await line_items_service.get_line_items_for_subcategory(
            db, current_user.id, subcategory_id
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
