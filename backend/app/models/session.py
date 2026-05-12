# Model 6: sessions (database.rule.md Section 3.2)
# FK → tables; self-referential FK → sessions
# CRITICAL: Partial unique index enforces BR-001 (only one open session per table)

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.orm import relationship

from app.core.database import Base


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    table_id = Column(Integer, ForeignKey("tables.id"), nullable=False)
    opened_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    closed_at = Column(DateTime(timezone=True), nullable=True)
    # status ∈ {open, waiting_payment, closed, merged}
    status = Column(Text, nullable=False, default="open")
    # Self-referential FK for session merging
    merged_into_session_id = Column(Integer, ForeignKey("sessions.id"), nullable=True)

    # Audit fields (Section 4)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    table = relationship("Table", back_populates="sessions")
    merged_into = relationship("Session", remote_side=[id], foreign_keys=[merged_into_session_id])
    orders = relationship("Order", back_populates="session")
    payments = relationship("Payment", back_populates="session")

    __table_args__ = (
        # BR-001: Only one open session per table — enforced at DB level
        # This partial unique index is CRITICAL and MUST NOT be removed
        Index(
            "idx_sessions_one_open_per_table",
            "table_id",
            unique=True,
            postgresql_where=text("status = 'open'"),
        ),
        # Performance indexes (Section 6)
        Index("idx_sessions_table_id", "table_id"),
        Index("idx_sessions_status", "status"),
    )
