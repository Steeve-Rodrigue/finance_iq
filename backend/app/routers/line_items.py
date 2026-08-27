from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.users import User
from app.schemas.line_items import SubcategorizeResponse
from app.services import subcategorizer_service

router = APIRouter(prefix="/line-items", tags=["line-items"])


@router.post("/subcategorize", response_model=SubcategorizeResponse)
async def subcategorize_line_items(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SubcategorizeResponse:
    summary = await subcategorizer_service.subcategorize_all_categories(db, current_user.id)
    return SubcategorizeResponse(**summary)
