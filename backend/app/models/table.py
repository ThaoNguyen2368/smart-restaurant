# Model 5: tables (database.rule.md Section 3.1)
# No FK dependencies

from sqlalchemy import Column, DateTime, Integer, Text, func
from sqlalchemy.orm import relationship

from app.core.database import Base


class Table(Base):
    __tablename__ = "tables"

    id = Column(Integer, primary_key=True, autoincrement=True)
    table_number = Column(Integer, nullable=False, unique=True)
    qr_code_url = Column(Text, nullable=False)
    # status ∈ {empty, occupied, waiting_payment}
    status = Column(Text, nullable=False, default="empty")
    floor = Column(Text, nullable=True)

    # Audit fields (Section 4)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    sessions = relationship("Session", back_populates="table")

    def __repr__(self):
        return f"<Table(id={self.id}, number={self.table_number}, status='{self.status}')>"
