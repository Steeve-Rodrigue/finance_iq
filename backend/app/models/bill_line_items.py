import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.bills import Bill
    from app.models.categories import Category
    from app.models.users import User


class BillLineItem(Base):
    __tablename__ = "bill_line_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    bill_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("bills.id"), nullable=False, index=True)
    # Nullable: a line item may be categorized separately from (and later than) its parent
    # bill. The ERD doesn't draw a CATEGORIES-BILL_LINE_ITEMS relationship arrow even though
    # this FK column is listed, so no back_populates is added on the Category side.
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("categories.id"), nullable=True, index=True
    )
    # A line item row is only ever created once the parser has extracted it, so its
    # description and line_total are known at creation time -> not nullable. quantity and
    # unit_price aren't always present on every bill (e.g. flat-fee statements), so those stay
    # nullable.
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    common_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    quantity: Mapped[float | None] = mapped_column(Numeric(12, 3), nullable=True)
    unit_price: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    line_total: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped["User"] = relationship()
    bill: Mapped["Bill"] = relationship(back_populates="line_items")
    category: Mapped["Category | None"] = relationship()
