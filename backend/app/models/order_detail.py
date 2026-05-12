# Model 8: order_details (database.rule.md Section 3.4)
# FK → orders, menu_items, staff_users

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    Text,
    func,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


class OrderDetail(Base):
    __tablename__ = "order_details"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("menu_items.id"), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    # unit_price = immutable snapshot of menu_items.price at order creation time (BR-004)
    unit_price = Column(Numeric(12, 2), nullable=False)
    note = Column(Text, nullable=True)
    # cooking_status ∈ {pending, confirmed, cooking, done, served, cancelled}
    cooking_status = Column(Text, nullable=False, default="pending")
    cancel_reason = Column(Text, nullable=True)
    cancelled_by = Column(Integer, ForeignKey("staff_users.id"), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    split_label = Column(Text, nullable=True)

    # Audit fields (Section 4)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    order = relationship("Order", back_populates="order_details")
    menu_item = relationship("MenuItem", back_populates="order_details")
    cancelled_by_user = relationship(
        "StaffUser",
        back_populates="cancelled_order_details",
        foreign_keys=[cancelled_by],
    )

    __table_args__ = (
        # quantity > 0
        CheckConstraint("quantity > 0", name="chk_quantity_positive"),
        # BR-003 partial: cancelled records MUST have a cancel_reason
        CheckConstraint(
            "cooking_status != 'cancelled' OR cancel_reason IS NOT NULL",
            name="chk_cancel_reason",
        ),
        # Performance indexes (Section 6)
        Index("idx_order_details_order_id", "order_id"),
        Index("idx_order_details_cooking_status", "cooking_status"),
    )

    def __repr__(self):
        return f"<OrderDetail(id={self.id}, order_id={self.order_id}, item_id={self.item_id}, status='{self.cooking_status}')>"
