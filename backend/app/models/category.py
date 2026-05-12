# Model 1: categories (database.rule.md Section 3.10)
# No FK dependencies — created first

from sqlalchemy import Column, Integer, Text
from sqlalchemy.orm import relationship

from app.core.database import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=False, unique=True)
    display_order = Column(Integer, nullable=False, default=0)

    # Relationships
    menu_items = relationship("MenuItem", back_populates="category")

    def __repr__(self):
        return f"<Category(id={self.id}, name='{self.name}')>"
