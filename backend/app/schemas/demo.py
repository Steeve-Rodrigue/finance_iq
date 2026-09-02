from pydantic import BaseModel

from app.schemas.bill_line_items import BillLineItemRead
from app.schemas.bills import BillRead
from app.schemas.elicitations import ElicitationRead


class DemoBillUploadResult(BaseModel):
    """Public counterpart to app/schemas/bills.py's BillUploadResult, returned by
    POST /demo/bills/upload. Includes line_items and elicitations inline (the real
    /bills/upload response doesn't) so frontend/lib/demo/demo-upload.ts can populate its local
    demo store in one round trip instead of a follow-up fetch per resource."""

    filename: str
    bill: BillRead | None = None
    line_items: list[BillLineItemRead] = []
    elicitations: list[ElicitationRead] = []
    error: str | None = None
