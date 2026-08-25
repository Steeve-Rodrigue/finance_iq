import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.bills import Bill
    from app.models.users import User


class Vendor(Base):
    __tablename__ = "vendors"
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_vendors_user_id_key"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # ERD spells this "adress" (typo) - corrected to "address" per confirmed decision.
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Normalized identity key used to match a vendor across bills (e.g. a slugified name).
    # Unique per-user, not globally, for the same multi-tenant reasoning as categories.slug.
    key: Mapped[str] = mapped_column(String(255), nullable=False)
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
    # `passive_deletes=True`: the vendors.id -> bills.vendor_id FK has no `ondelete` (Postgres
    # default NO ACTION, i.e. RESTRICT-like). Without this, SQLAlchemy's ORM would proactively
    # load this collection on delete and null out `bills.vendor_id` itself, silently orphaning
    # bills instead of ever letting Postgres raise the FK violation that
    # `vendors_service.delete_vendor` catches and turns into a 409.
    bills: Mapped[list["Bill"]] = relationship(back_populates="vendor", passive_deletes=True)
