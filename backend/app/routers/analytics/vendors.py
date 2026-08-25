import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.exceptions import NotFoundError
from app.models.users import User
from app.repos.analytics.vendors_repo import VendorFilters
from app.schemas.analytics.vendors import VendorDetailResponse, VendorsAnalyticsResponse
from app.services.analytics import vendors_service

router = APIRouter()


@router.get("/vendors", response_model=VendorsAnalyticsResponse)
async def get_vendors_analytics(
    start_date: date | None = None,
    end_date: date | None = None,
    category_id: uuid.UUID | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VendorsAnalyticsResponse:
    filters = VendorFilters(start_date=start_date, end_date=end_date, category_id=category_id)
    return await vendors_service.get_vendors_analytics(db, current_user.id, filters)


@router.get("/vendors/{vendor_id}", response_model=VendorDetailResponse)
async def get_vendor_detail(
    vendor_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VendorDetailResponse:
    try:
        return await vendors_service.get_vendor_detail(db, current_user.id, vendor_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
