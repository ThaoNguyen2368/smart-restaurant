# Model 3: staff_users (database.rule.md Section 3.8)
# No FK dependencies

from sqlalchemy import Boolean, Column, Integer, Text
from sqlalchemy.orm import relationship

from app.core.database import Base


class StaffUser(Base):
    __tablename__ = "staff_users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(Text, nullable=False, unique=True)
    password_hash = Column(Text, nullable=False)
    # role ∈ {staff, cashier, manager, admin, kitchen}
    role = Column(Text, nullable=False, default="staff")
    is_active = Column(Boolean, nullable=False, default=True)
    display_name = Column(Text, nullable=False)

    # Relationships
    tax_configs = relationship("TaxConfig", back_populates="creator")
    payments = relationship("Payment", back_populates="cashier")
    cancelled_order_details = relationship(
        "OrderDetail",
        back_populates="cancelled_by_user",
        foreign_keys="OrderDetail.cancelled_by",
    )
    audit_logs = relationship("AuditLog", back_populates="actor")

    def __repr__(self):
        return f"<StaffUser(id={self.id}, username='{self.username}', role='{self.role}')>"
