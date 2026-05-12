# Model 10: audit_logs (database.rule.md Section 3.7)
# FK → staff_users
# BR-007: INSERT-only — No UPDATE or DELETE permitted
# Exception: No updated_at field (append-only, Section 4)

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.core.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # actor_id is nullable — NULL when actor is a customer
    actor_id = Column(Integer, ForeignKey("staff_users.id"), nullable=True)
    # actor_type ∈ {customer, staff, cashier, manager, admin, system}
    actor_type = Column(Text, nullable=False)
    action = Column(Text, nullable=False)
    # entity_type ∈ {order_detail, order, session, payment}
    entity_type = Column(Text, nullable=False)
    entity_id = Column(Integer, nullable=False)
    before_state = Column(JSONB, nullable=True)
    after_state = Column(JSONB, nullable=True)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    # Relationships
    actor = relationship("StaffUser", back_populates="audit_logs")

    __table_args__ = (
        # Performance indexes (Section 6)
        Index("idx_audit_logs_entity", "entity_type", "entity_id"),
        Index("idx_audit_logs_actor", "actor_id"),
        # DESC index for cursor-based pagination
        Index("idx_audit_logs_created_at", text("created_at DESC")),
    )

    def __repr__(self):
        return f"<AuditLog(id={self.id}, action='{self.action}', entity='{self.entity_type}:{self.entity_id}')>"

