# Model 7: orders (database.rule.md Section 3.3)
# FK → sessions

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, Numeric, Text, func
from sqlalchemy.orm import relationship

from app.core.database import Base


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    # NUMERIC(12,2) for ALL monetary values — NOT REAL or FLOAT
    subtotal = Column(Numeric(12, 2), nullable=False, default=0)
    tax_amount = Column(Numeric(12, 2), nullable=False, default=0)
    service_charge = Column(Numeric(12, 2), nullable=False, default=0)
    total_price = Column(Numeric(12, 2), nullable=False, default=0)
    # order_status ∈ {pending, confirmed, completed, cancelled}
    order_status = Column(Text, nullable=False, default="pending")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    # Audit fields (Section 4)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    session = relationship("Session", back_populates="orders")
    order_details = relationship("OrderDetail", back_populates="order")

    __table_args__ = (
        # Performance index (Section 6)
        Index("idx_orders_session_id", "session_id"),
    )

    def __repr__(self):
        return f"<Order(id={self.id}, session_id={self.session_id}, status='{self.order_status}', total={self.total_price})>"
