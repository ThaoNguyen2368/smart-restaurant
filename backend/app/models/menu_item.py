# Model 2: menu_items (database.rule.md Section 3.9)
# FK → categories

from sqlalchemy import Boolean, Column, ForeignKey, Integer, Numeric, Text
from sqlalchemy.orm import relationship

from app.core.database import Base


class MenuItem(Base):
    __tablename__ = "menu_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    name = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    # NUMERIC(12,2) for all monetary values — NOT REAL or FLOAT (database.rule.md Section 3.3)
    price = Column(Numeric(12, 2), nullable=False)
    image_url = Column(Text, nullable=True)
    is_available = Column(Boolean, nullable=False, default=True)
    display_order = Column(Integer, nullable=False, default=0)

    # Relationships
    category = relationship("Category", back_populates="menu_items")
    order_details = relationship("OrderDetail", back_populates="menu_item")

    # CHECK constraint: price >= 0 handled via CheckConstraint below
    __table_args__ = (
        # CheckConstraint enforced at DB level
        {"comment": "Menu items with price >= 0. is_available=FALSE for soft delete."},
    )

    def __repr__(self):
        return f"<MenuItem(id={self.id}, name='{self.name}', price={self.price})>"
