from fastapi import APIRouter

from app.routers.analytics import (
    agent_insights,
    categories,
    elicitations,
    line_items,
    overview,
    spend,
    vendors,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])
router.include_router(overview.router)
router.include_router(spend.router)
router.include_router(categories.router)
router.include_router(vendors.router)
router.include_router(agent_insights.router)
router.include_router(elicitations.router)
router.include_router(line_items.router)
