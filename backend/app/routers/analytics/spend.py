from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.users import User
from app.repos.analytics.spend_repo import SpendFilters
from app.schemas.analytics.spend import SpendAnalyticsResponse
from app.services.analytics import spend_service

router = APIRouter()


@router.get("/spend", response_model=SpendAnalyticsResponse)
async def get_spend_analytics(
    start_date: date | None = None,
    end_date: date | None = None,
    vendor_id: UUID | None = None,
    category_id: UUID | None = None,
    granularity: Literal["day", "week", "month", "year"] = "month",
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SpendAnalyticsResponse:
    filters = SpendFilters(
        start_date=start_date, end_date=end_date, vendor_id=vendor_id, category_id=category_id
    )
    return await spend_service.get_spend_analytics(db, current_user.id, filters, granularity)
