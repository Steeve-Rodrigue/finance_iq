import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.categories import Category
    from app.models.users import User


class Subcategory(Base):
    __tablename__ = "subcategories"
    __table_args__ = (
        UniqueConstraint(
            "category_id",
            "parent_subcategory_id",
            "slug",
            name="uq_subcategories_category_id_parent_subcategory_id_slug",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("categories.id"), nullable=False, index=True
    )
    # Null for a level-1 subcategory, set to another Subcategory's id for a level-2
    # sub-subcategory - the agent decides depth per category, not a fixed schema depth.
    parent_subcategory_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("subcategories.id"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
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

    # One-directional relationships only - no back_populates/children collection. Tree
    # assembly for the category-tree chart happens in Python from a flat query result
    # (app/services/analytics/line_items_service.py), not via ORM traversal.
    user: Mapped["User"] = relationship()
    category: Mapped["Category"] = relationship()
    parent: Mapped["Subcategory | None"] = relationship(remote_side=[id])
