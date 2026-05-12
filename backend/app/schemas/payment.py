# schemas/payment.py — Payment schemas
# BR-006: cashier_id is mandatory (Segregation of Duties)

from decimal import Decimal
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class PaymentCreate(BaseModel):
    """Record a payment — Cashier only."""
    session_id: int
    amount: Decimal = Field(..., gt=0)
    payment_method: str = Field(..., pattern="^(cash|card|transfer|voucher)$")
    transaction_ref: Optional[str] = None
    split_label: Optional[str] = None


class PaymentResponse(BaseModel):
    id: int
    session_id: int
    cashier_id: int
    amount: Decimal
    payment_method: str
    transaction_ref: Optional[str]
    paid_at: datetime
    split_label: Optional[str]
    status: str

    class Config:
        from_attributes = True


class SplitBillItem(BaseModel):
    """Assign order details to a split group."""
    order_detail_id: int
    split_label: str


class SplitBillRequest(BaseModel):
    """Create split bill assignments."""
    items: list[SplitBillItem] = Field(..., min_length=1)


class InvoiceResponse(BaseModel):
    """Full invoice for a session."""
    session_id: int
    table_number: int
    subtotal: Decimal
    tax_amount: Decimal
    service_charge: Decimal
    total: Decimal
    vat_rate: Decimal
    service_charge_rate: Decimal
    orders: list = []
    payments: list[PaymentResponse] = []
    split_groups: dict = {}
    total_paid: Decimal = Decimal("0")
    remaining: Decimal = Decimal("0")
