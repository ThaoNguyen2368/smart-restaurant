# Model 9: payments (database.rule.md Section 3.5)
# FK → sessions, staff_users

from sqlalchemy import CheckConstraint, Column, DateTime, ForeignKey, Index, Integer, Numeric, Text, func
from sqlalchemy.orm import relationship

from app.core.database import Base


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    # BR-006: cashier_id is mandatory — Segregation of Duties
    cashier_id = Column(Integer, ForeignKey("staff_users.id"), nullable=False)
    # NUMERIC(12,2) for monetary values
    amount = Column(Numeric(12, 2), nullable=False)
    # payment_method ∈ {cash, card, transfer, voucher}
    payment_method = Column(Text, nullable=False)
    transaction_ref = Column(Text, nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    split_label = Column(Text, nullable=True)
    # status ∈ {completed, refunded}
    status = Column(Text, nullable=False, default="completed")

    # Audit fields (Section 4)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    session = relationship("Session", back_populates="payments")
    cashier = relationship("StaffUser", back_populates="payments")

    __table_args__ = (
        # amount > 0
        CheckConstraint("amount > 0", name="chk_payment_amount_positive"),
        # Performance index (Section 6)
        Index("idx_payments_session_id", "session_id"),
    )

    def __repr__(self):
        return f"<Payment(id={self.id}, session_id={self.session_id}, amount={self.amount}, method='{self.payment_method}')>"
