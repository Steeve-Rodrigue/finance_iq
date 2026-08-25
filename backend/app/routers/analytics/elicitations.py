from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.users import User
from app.schemas.analytics.elicitations import ElicitationsAnalyticsResponse
from app.services.analytics import elicitations_service

router = APIRouter()


@router.get("/elicitations", response_model=ElicitationsAnalyticsResponse)
async def get_elicitations_analytics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ElicitationsAnalyticsResponse:
    return await elicitations_service.get_elicitations_analytics(db, current_user.id)
