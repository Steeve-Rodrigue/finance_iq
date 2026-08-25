import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.users import User
from app.repos.analytics.line_items_repo import LineItemFilters
from app.schemas.analytics.line_items import LineItemsAnalyticsResponse
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
