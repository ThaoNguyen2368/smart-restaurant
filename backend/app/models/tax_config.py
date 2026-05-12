# Model 4: tax_config (database.rule.md Section 3.6)
# FK → staff_users via created_by

from sqlalchemy import Column, Date, ForeignKey, Integer, Numeric
from sqlalchemy.orm import relationship

from app.core.database import Base


class TaxConfig(Base):
    __tablename__ = "tax_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # NUMERIC(5,4) — rates between 0 and 1 (e.g., 0.0800 = 8%)
    vat_rate = Column(Numeric(5, 4), nullable=False)
    service_charge_rate = Column(Numeric(5, 4), nullable=False)
    effective_from = Column(Date, nullable=False)
    created_by = Column(Integer, ForeignKey("staff_users.id"), nullable=False)

    # Relationships
    creator = relationship("StaffUser", back_populates="tax_configs")

    # Exception: tax_config is immutable after creation — no updated_at field (Section 4)

    def __repr__(self):
        return f"<TaxConfig(id={self.id}, vat={self.vat_rate}, service={self.service_charge_rate})>"
