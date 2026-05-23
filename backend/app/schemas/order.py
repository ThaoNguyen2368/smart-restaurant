# schemas/order.py — Order + OrderDetail schemas
# BR-005: Never trust client-provided totals — only accept items + quantities

from decimal import Decimal
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# ─── Order Creation (Customer) ───
class OrderItemCreate(BaseModel):
    """Single item in an order — client sends only item_id, quantity, note.
    Price is NEVER accepted from client (BR-005)."""
    item_id: int
    quantity: int = Field(..., gt=0)
    note: Optional[str] = None


class OrderCreate(BaseModel):
    """Customer order creation request.
    Session ID comes from X-Session-ID header, not body."""
    items: list[OrderItemCreate] = Field(..., min_length=1)


# ─── Order Detail Response ───
class MenuItemMinimal(BaseModel):
    name: str

    class Config:
        from_attributes = True


class SessionMinimal(BaseModel):
    table_id: int

    class Config:
        from_attributes = True


class OrderMinimal(BaseModel):
    session: SessionMinimal

    class Config:
        from_attributes = True


class OrderDetailResponse(BaseModel):
    id: int
    order_id: int
    item_id: int
    quantity: int
    unit_price: Decimal
    note: Optional[str]
    cooking_status: str
    cancel_reason: Optional[str]
    cancelled_by: Optional[int]
    cancelled_at: Optional[datetime]
    split_label: Optional[str]
    
    # Nested info for UIs (Kitchen/Cashier)
    menu_item: Optional[MenuItemMinimal] = None
    order: Optional[OrderMinimal] = None

    class Config:
        from_attributes = True


# ─── Order Response ───
class OrderResponse(BaseModel):
    id: int
    session_id: int
    table_id: Optional[int] = None
    subtotal: Decimal
    tax_amount: Decimal
    service_charge: Decimal
    total_price: Decimal
    order_status: str
    created_at: datetime
    order_details: list[OrderDetailResponse] = []

    class Config:
        from_attributes = True


# ─── Status Updates ───
class CookingStatusUpdate(BaseModel):
    """Kitchen updates cooking_status."""
    cooking_status: str = Field(..., pattern="^(cooking|done|served)$")


class CancelRequest(BaseModel):
    """Cancel request — cancel_reason required for cooking items (BR-003)."""
    cancel_reason: Optional[str] = None


class CancelApproval(BaseModel):
    """Manager approves cancel for cooking items."""
    approved: bool
    reason: Optional[str] = None

class SubstituteItemRequest(BaseModel):
    """Staff substitutes an out-of-stock item with a new one."""
    new_item_id: int


class OrderItemUpdate(BaseModel):
    item_id: int
    quantity: int = Field(..., gt=0)
    note: Optional[str] = None


class OrderUpdateRequest(BaseModel):
    items: list[OrderItemUpdate]


