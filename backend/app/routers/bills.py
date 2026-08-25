import uuid

import structlog
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app import storage
from app.database import get_db
from app.dependencies import get_current_user
from app.exceptions import NotFoundError
from app.models.users import User
from app.schemas.bills import BillCreate, BillRead, BillUpdate, BillUploadResult
from app.services import bill_parser_service, bills_service

logger = structlog.get_logger()

router = APIRouter(prefix="/bills", tags=["bills"])

MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024

# CRUD baseline only - see app/services/bills_service.py for why the decision-loop logic
# (confidence scoring, retry, elicitation) is intentionally absent from create/update/etc.
# below. /upload is the exception - it's this phase's actual decision-loop entry point.

# FastAPI's auto-generated schema for list[UploadFile] uses OpenAPI 3.1's `contentMediaType`,
# which Swagger UI doesn't render as a file picker for array items (falls back to
# "array<string>, Add string item"). Overriding with the older `format: binary` keyword here
# is purely a docs/Swagger-UI rendering fix - doesn't change what the endpoint accepts.
_UPLOAD_OPENAPI_EXTRA = {
    "requestBody": {
        "required": True,
        "content": {
            "multipart/form-data": {
                "schema": {
                    "type": "object",
                    "required": ["files"],
                    "properties": {
                        "files": {
                            "type": "array",
                            "items": {"type": "string", "format": "binary"},
                        }
                    },
                }
            }
        },
    }
}


@router.post(
    "/upload",
    response_model=list[BillUploadResult],
    status_code=status.HTTP_201_CREATED,
    openapi_extra=_UPLOAD_OPENAPI_EXTRA,
)
async def upload_bills(
    files: list[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[BillUploadResult]:
    # Cached once, up front: db.rollback() (below) expires every already-loaded ORM object in
    # the session, including current_user - re-touching current_user.id after a mid-batch
    # rollback would try to lazily refresh an expired attribute outside of an active greenlet
    # context and crash. Plain UUIDs aren't session state, so this sidesteps that entirely.
    user_id = current_user.id
    results: list[BillUploadResult] = []
    for file in files:
        filename = file.filename or "upload.pdf"
        try:
            if not filename.lower().endswith(".pdf"):
                raise ValueError("only PDF files are supported")
            content = await file.read()
            if len(content) > MAX_UPLOAD_SIZE_BYTES:
                raise ValueError(
                    f"file exceeds the {MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)}MB upload limit"
                )
            storage_key, file_hash = storage.save_upload(user_id, content)
            bill = await bills_service.create_bill(
                db,
                user_id,
                name=filename,
                storage_key=storage_key,
                file_hash=file_hash,
            )
            await bill_parser_service.parse_and_persist_bill(
                db, user_id, bill.id, storage.resolve_path(storage_key)
            )
            bill = await bills_service.get_bill(db, user_id, bill.id)
            results.append(BillUploadResult(filename=filename, bill=BillRead.model_validate(bill)))
        except Exception as exc:
            # Per-file isolation: one bad file must not abort the rest of the batch, so every
            # failure mode funnels into this file's own result instead of a 500 for the whole
            # request. A failed flush leaves the shared AsyncSession's transaction aborted, so
            # it must be rolled back before the next file gets a chance to use the session.
            await db.rollback()
            logger.warning("bill_upload.failed", filename=filename, error=str(exc))
            results.append(BillUploadResult(filename=filename, error=str(exc)))
    return results


@router.post("/", response_model=BillRead, status_code=status.HTTP_201_CREATED)
async def create_bill(
    body: BillCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BillRead:
    fields = body.model_dump(exclude={"name", "storage_key", "file_hash"}, exclude_unset=True)
    try:
        bill = await bills_service.create_bill(
            db,
            current_user.id,
            name=body.name,
            storage_key=body.storage_key,
            file_hash=body.file_hash,
            **fields,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return BillRead.model_validate(bill)


@router.get("/", response_model=list[BillRead])
async def list_bills(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[BillRead]:
    bills = await bills_service.list_bills(db, current_user.id)
    return [BillRead.model_validate(bill) for bill in bills]


@router.get("/{bill_id}", response_model=BillRead)
async def get_bill(
    bill_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BillRead:
    try:
        bill = await bills_service.get_bill(db, current_user.id, bill_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return BillRead.model_validate(bill)


@router.patch("/{bill_id}", response_model=BillRead)
async def update_bill(
    bill_id: uuid.UUID,
    body: BillUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BillRead:
    fields = body.model_dump(exclude_unset=True)
    try:
        bill = await bills_service.update_bill(db, current_user.id, bill_id, **fields)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return BillRead.model_validate(bill)


@router.delete("/{bill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bill(
    bill_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await bills_service.delete_bill(db, current_user.id, bill_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
