# schemas/menu.py — Menu Item + Category schemas

from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, Field


# ─── Category ───
class CategoryCreate(BaseModel):
    name: str
    display_order: int = 0


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    display_order: Optional[int] = None


class CategoryResponse(BaseModel):
    id: int
    name: str
    display_order: int

    class Config:
        from_attributes = True


# ─── MenuItem ───
class MenuItemCreate(BaseModel):
    category_id: int
    name: str
    description: Optional[str] = None
    price: Decimal = Field(..., ge=0, decimal_places=2)
    image_url: Optional[str] = None
    is_available: bool = True
    display_order: int = 0


class MenuItemUpdate(BaseModel):
    category_id: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[Decimal] = Field(None, ge=0, decimal_places=2)
    image_url: Optional[str] = None
    is_available: Optional[bool] = None
    display_order: Optional[int] = None


class MenuItemResponse(BaseModel):
    id: int
    category_id: int
    name: str
    description: Optional[str]
    price: Decimal
    image_url: Optional[str]
    is_available: bool
    display_order: int
    is_best_seller: bool = False

    class Config:
        from_attributes = True


class MenuResponse(BaseModel):
    """Full menu grouped by categories."""
    categories: list[CategoryResponse]
    items: list[MenuItemResponse]
