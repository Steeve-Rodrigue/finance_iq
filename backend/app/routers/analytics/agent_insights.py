from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.users import User
from app.schemas.analytics.agent_insights import AgentInsightsResponse
from app.services.analytics import agent_insights_service

router = APIRouter()


@router.get("/agent-insights", response_model=AgentInsightsResponse)
async def get_agent_insights(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AgentInsightsResponse:
    return await agent_insights_service.get_agent_insights(db, current_user.id)
