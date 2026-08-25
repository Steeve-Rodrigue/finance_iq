from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.users import User
from app.repos.analytics.categories_repo import CategoryFilters
from app.schemas.analytics.categories import CategoriesAnalyticsResponse
from app.services.analytics import categories_service

router = APIRouter()


@router.get("/categories", response_model=CategoriesAnalyticsResponse)
async def get_categories_analytics(
    start_date: date | None = None,
    end_date: date | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CategoriesAnalyticsResponse:
    filters = CategoryFilters(start_date=start_date, end_date=end_date)
    return await categories_service.get_categories_analytics(db, current_user.id, filters)
