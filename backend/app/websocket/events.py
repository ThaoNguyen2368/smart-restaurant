# websocket/events.py — Typed WebSocket event schemas
# backend.rule.md Section 6.2

from datetime import datetime, timezone
from pydantic import BaseModel
from typing import Any


class WSEvent(BaseModel):
    """Mandatory WebSocket event schema (backend.rule.md Section 6.2)."""
    event: str
    payload: dict[str, Any]
    timestamp: str

    @classmethod
    def create(cls, event: str, payload: dict[str, Any]) -> "WSEvent":
        return cls(
            event=event,
            payload=payload,
            timestamp=datetime.now(timezone.utc).isoformat(),
        )


# Valid event names by channel (backend.rule.md Section 6.2)
CUSTOMER_EVENTS = [
    "ORDER_UPDATED",
    "ITEM_STATUS_CHANGED",
    "MENU_ITEM_DISABLED",
    "SESSION_CLOSED",
    "TABLE_TRANSFERRED",
]
STAFF_EVENTS = [
    "NEW_ORDER",
    "PAYMENT_REQUESTED",
    "OUT_OF_STOCK",
    "CANCEL_REQUEST_PENDING",
    "TABLE_TRANSFERRED",
    "ORDER_REMINDER",
    "ORDER_ESCALATION",
]
KITCHEN_EVENTS = [
    "NEW_ORDER_CONFIRMED",
    "CANCEL_REQUEST",
    "BUSY_MODE_CHANGED",
]
CASHIER_EVENTS = [
    "PAYMENT_REQUESTED",
    "SPLIT_BILL_UPDATED",
]
