import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.exceptions import ConflictError, NotFoundError
from app.models.users import User
from app.schemas.vendors import VendorCreate, VendorRead, VendorUpdate
from app.services import vendors_service

router = APIRouter(prefix="/vendors", tags=["vendors"])


@router.post("/", response_model=VendorRead, status_code=status.HTTP_201_CREATED)
async def create_vendor(
    body: VendorCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VendorRead:
    try:
        vendor = await vendors_service.create_vendor(
            db, current_user.id, name=body.name, key=body.key, address=body.address
        )
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return VendorRead.model_validate(vendor)


@router.get("/", response_model=list[VendorRead])
async def list_vendors(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[VendorRead]:
    vendors = await vendors_service.list_vendors(db, current_user.id)
    return [VendorRead.model_validate(vendor) for vendor in vendors]


@router.get("/{vendor_id}", response_model=VendorRead)
async def get_vendor(
    vendor_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VendorRead:
    try:
        vendor = await vendors_service.get_vendor(db, current_user.id, vendor_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return VendorRead.model_validate(vendor)


@router.patch("/{vendor_id}", response_model=VendorRead)
async def update_vendor(
    vendor_id: uuid.UUID,
    body: VendorUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VendorRead:
    try:
        vendor = await vendors_service.update_vendor(
            db, current_user.id, vendor_id, name=body.name, address=body.address, key=body.key
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return VendorRead.model_validate(vendor)


@router.delete("/{vendor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vendor(
    vendor_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await vendors_service.delete_vendor(db, current_user.id, vendor_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
