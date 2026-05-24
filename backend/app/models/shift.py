from sqlalchemy import Column, Integer, Numeric, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship

from app.core.database import Base

class CashierShift(Base):
    __tablename__ = "cashier_shifts"

    id = Column(Integer, primary_key=True, index=True)
    cashier_id = Column(Integer, ForeignKey("staff_users.id"), nullable=False)
    start_time = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=True)
    
    system_total = Column(Numeric(15, 2), nullable=True)
    actual_total = Column(Numeric(15, 2), nullable=True)
    difference = Column(Numeric(15, 2), nullable=True)

    cashier = relationship("StaffUser")
