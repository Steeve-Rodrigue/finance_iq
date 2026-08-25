from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.users import User
from app.schemas.analytics.overview import OverviewResponse
from app.services.analytics import overview_service

router = APIRouter()


@router.get("/overview", response_model=OverviewResponse)
async def get_overview(
    granularity: Literal["day", "week", "month", "year"] = "month",
    months: int = Query(default=6, ge=1, le=24),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> OverviewResponse:
    return await overview_service.get_overview(db, current_user.id, granularity, months)
