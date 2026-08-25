import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.bills import Bill
    from app.models.users import User


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("user_id", "slug", name="uq_categories_user_id_slug"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Unique per-user, not globally: the ERD marks `slug` as a unique key (UK) but doesn't
    # state the scope. Two different users each having a "utilities" category is normal in a
    # multi-tenant app, so uniqueness is scoped to (user_id, slug) rather than global.
    slug: Mapped[str] = mapped_column(String(255), nullable=False)
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
    # `passive_deletes=True`: the categories.id -> bills.category_id FK has no `ondelete`
    # (Postgres default NO ACTION, i.e. RESTRICT-like). Without this, SQLAlchemy's ORM would
    # proactively load this collection on delete and null out `bills.category_id` itself,
    # silently orphaning bills instead of ever letting Postgres raise the FK violation that
    # `categories_service.delete_category` catches and turns into a 409.
    bills: Mapped[list["Bill"]] = relationship(back_populates="category", passive_deletes=True)
