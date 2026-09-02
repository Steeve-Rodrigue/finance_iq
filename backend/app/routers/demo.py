import structlog
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app import storage
from app.database import get_db
from app.dependencies import apply_rls_user
from app.repos import bill_line_items_repo, elicitations_repo
from app.schemas.bill_line_items import BillLineItemRead
from app.schemas.bills import BillRead
from app.schemas.demo import DemoBillUploadResult
from app.schemas.elicitations import ElicitationRead
from app.services import bill_parser_service, bills_service, demo_service, rate_limiter

logger = structlog.get_logger()

router = APIRouter(prefix="/demo", tags=["demo"])

MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024

# Public, unauthenticated, real-cost endpoint - deliberately tighter than app/routers/bills.py's
# real upload (2 requests / 10 minutes per client IP, one file per request), see
# app/services/rate_limiter.py's own caveats about what this can and can't actually stop.
RATE_LIMIT_MAX_REQUESTS = 2
RATE_LIMIT_WINDOW_SECONDS = 10 * 60


@router.post(
    "/bills/upload",
    response_model=list[DemoBillUploadResult],
    status_code=status.HTTP_201_CREATED,
)
async def demo_upload_bills(
    request: Request,
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
) -> list[DemoBillUploadResult]:
    """Public counterpart to app/routers/bills.py's upload_bills - no auth, always scoped to
    the one shared demo account (app/services/demo_service.py). Exists so a portfolio visitor
    can see the real vision parser run instead of frontend/lib/demo/demo-upload.ts's
    previously-fabricated result, without needing to sign up. Runs the exact same
    bill_parser_service.parse_and_persist_bill real accounts use - nothing about the actual
    decision loop is special-cased for demo."""
    client_ip = request.client.host if request.client else "unknown"
    if not rate_limiter.is_allowed(
        client_ip,
        max_requests=RATE_LIMIT_MAX_REQUESTS,
        window_seconds=RATE_LIMIT_WINDOW_SECONDS,
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many demo uploads from this connection - please wait a few minutes "
            "and try again.",
        )

    user_id = await demo_service.get_or_create_demo_user(db)
    await apply_rls_user(db, user_id)

    results: list[DemoBillUploadResult] = []
    # One file per request, regardless of how many were sent - keeps a single call's latency
    # and OpenRouter cost bounded, unlike the real endpoint's unbounded batch upload.
    for file in files[:1]:
        filename = file.filename or "upload.pdf"
        try:
            if not filename.lower().endswith(".pdf"):
                raise ValueError("only PDF files are supported")
            content = await file.read()
            if len(content) > MAX_UPLOAD_SIZE_BYTES:
                raise ValueError(
                    f"file exceeds the {MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)}MB upload limit"
                )
            await demo_service.enforce_bill_cap(db, user_id)
            storage_key, file_hash = storage.compute_storage_key(user_id, content)
            bill = await bills_service.create_bill(
                db,
                user_id,
                name=filename,
                storage_key=storage_key,
                file_hash=file_hash,
            )
            with storage.temp_pdf(content) as pdf_path:
                await bill_parser_service.parse_and_persist_bill(db, user_id, bill.id, pdf_path)
            bill = await bills_service.get_bill(db, user_id, bill.id)
            line_items = await bill_line_items_repo.list_by_bill(db, user_id, bill.id)
            elicitations = await elicitations_repo.list_by_bill(db, user_id, bill.id)
            results.append(
                DemoBillUploadResult(
                    filename=filename,
                    bill=BillRead.model_validate(bill),
                    line_items=[BillLineItemRead.model_validate(item) for item in line_items],
                    elicitations=[
                        ElicitationRead.model_validate(elicitation) for elicitation in elicitations
                    ],
                )
            )
        except Exception as exc:
            # Same per-file isolation/rollback reasoning as app/routers/bills.py's real
            # upload_bills - see that function's comment.
            await db.rollback()
            logger.warning("demo_bill_upload.failed", filename=filename, error=str(exc))
            results.append(DemoBillUploadResult(filename=filename, error=str(exc)))
    return results


@router.post("/cleanup", status_code=status.HTTP_200_OK)
async def demo_cleanup(db: AsyncSession = Depends(get_db)) -> dict[str, int]:
    """Hit periodically by .github/workflows/demo_cleanup.yaml - the same ping-an-endpoint
    cron pattern keep_alive.yaml already uses for Render's cold-start prevention. Deletes
    demo bills older than demo_service.DEMO_BILL_MAX_AGE. Public and safe to call anytime,
    including with no demo account created yet (get_demo_user_id_if_exists, not
    get_or_create): it only ever removes rows already past the age cutoff, so a stray or
    repeated call can't affect a visitor's in-flight or freshly-finished upload."""
    user_id = await demo_service.get_demo_user_id_if_exists(db)
    if user_id is None:
        return {"deleted": 0}
    await apply_rls_user(db, user_id)
    deleted = await demo_service.cleanup_stale_bills(db, user_id)
    return {"deleted": deleted}
