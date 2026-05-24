# services/kitchen_service.py — Kitchen operations
from datetime import datetime, timezone
from fastapi import HTTPException, status
from sqlalchemy.orm import Session as DBSession, joinedload

from app.models.order_detail import OrderDetail
from app.models.order import Order
from app.models.menu_item import MenuItem
from app.services import state_machine, audit_service
from app.services.order_service import recalculate_order_total
from app.websocket.manager import ws_manager
from app.websocket.events import WSEvent


def get_kitchen_queue(db: DBSession, category_id: int | None = None) -> list[OrderDetail]:
    """FIFO queue of confirmed items for kitchen."""
    query = (
        db.query(OrderDetail)
        .join(Order)
        .options(
            joinedload(OrderDetail.menu_item),
            joinedload(OrderDetail.order).joinedload(Order.session)
        )
        .filter(OrderDetail.cooking_status.in_(["confirmed", "cooking", "done"]))
    )
    if category_id is not None:
        query = query.join(MenuItem, OrderDetail.item_id == MenuItem.id).filter(MenuItem.category_id == category_id)
        
    return query.order_by(Order.created_at).all()


async def update_cooking_status(db: DBSession, detail_id: int, new_status: str, actor_id: int) -> OrderDetail:
    """Kitchen updates cooking_status (confirmed→cooking, cooking→done)."""
    detail = db.query(OrderDetail).filter(OrderDetail.id == detail_id).first()
    if not detail:
        raise HTTPException(status_code=404, detail="Order detail not found")

    state_machine.validate_order_detail_transition(detail.cooking_status, new_status, "kitchen")
    before = {"cooking_status": detail.cooking_status}
    detail.cooking_status = new_status

    audit_service.write_audit_log(db, actor_id, "kitchen", f"update_status_{new_status}", "order_detail", detail_id, before, {"cooking_status": new_status})
    db.commit()

    await ws_manager.broadcast(f"orders:{db.query(Order).filter(Order.id == detail.order_id).first().session_id}", WSEvent.create("ITEM_STATUS_CHANGED", {"order_detail_id": detail_id, "new_status": new_status}))
    db.refresh(detail)
    return detail


async def cancel_order_detail(db: DBSession, detail_id: int, actor_id: int, actor_role: str, cancel_reason: str = None) -> OrderDetail:
    """Cancel an order detail item. Validates via state machine."""
    detail = db.query(OrderDetail).filter(OrderDetail.id == detail_id).first()
    if not detail:
        raise HTTPException(status_code=404, detail="Order detail not found")

    state_machine.validate_order_detail_transition(detail.cooking_status, "cancelled", actor_role)

    # BR-003: cancel_reason mandatory when cancelling from cooking
    if detail.cooking_status == "cooking" and not cancel_reason:
        raise HTTPException(status_code=400, detail={"error": "BUSINESS_RULE_VIOLATION", "message": "cancel_reason is required when cancelling from cooking status.", "code": "BR-003"})

    before = {"cooking_status": detail.cooking_status}
    detail.cooking_status = "cancelled"
    detail.cancel_reason = cancel_reason
    detail.cancelled_by = actor_id
    detail.cancelled_at = datetime.now(timezone.utc)

    db.flush()

    # BR-002: Recalculate order total
    recalculate_order_total(db, detail.order_id)

    audit_service.write_audit_log(db, actor_id, actor_role, "cancel_item", "order_detail", detail_id, before, {"cooking_status": "cancelled"}, reason=cancel_reason)
    db.commit()

    order = db.query(Order).filter(Order.id == detail.order_id).first()
    await ws_manager.broadcast(f"orders:{order.session_id}", WSEvent.create("ITEM_STATUS_CHANGED", {
        "order_detail_id": detail_id, 
        "new_status": "cancelled",
        "cancel_reason": cancel_reason
    }))
    # BR-010: Xóa món khỏi hàng đợi bếp ngay lập tức
    await ws_manager.broadcast("kitchen", WSEvent.create("ITEM_CANCELLED", {
        "order_detail_id": detail_id
    }))
    db.refresh(detail)
    return detail


async def mark_served(db: DBSession, detail_id: int, actor_id: int, actor_role: str) -> OrderDetail:
    """Staff marks item as served (done → served)."""
    detail = db.query(OrderDetail).filter(OrderDetail.id == detail_id).first()
    if not detail:
        raise HTTPException(status_code=404, detail="Order detail not found")

    state_machine.validate_order_detail_transition(detail.cooking_status, "served", actor_role)
    before = {"cooking_status": detail.cooking_status}
    detail.cooking_status = "served"

    audit_service.write_audit_log(db, actor_id, actor_role, "mark_served", "order_detail", detail_id, before, {"cooking_status": "served"})
    db.commit()

    order = db.query(Order).filter(Order.id == detail.order_id).first()
    await ws_manager.broadcast(f"orders:{order.session_id}", WSEvent.create("ITEM_STATUS_CHANGED", {"order_detail_id": detail_id, "new_status": "served"}))
    db.refresh(detail)
    return detail

async def substitute_order_detail(db: DBSession, detail_id: int, new_item_id: int, actor_id: int, actor_role: str) -> OrderDetail:
    """Staff substitutes an out-of-stock item with a new one."""
    detail = db.query(OrderDetail).filter(OrderDetail.id == detail_id).first()
    if not detail:
        raise HTTPException(status_code=404, detail="Order detail not found")

    if detail.cooking_status not in ["pending", "confirmed"]:
        raise HTTPException(status_code=400, detail="Chỉ có thể thay thế món ở trạng thái 'pending' hoặc 'confirmed'")

    new_item = db.query(MenuItem).filter(MenuItem.id == new_item_id).first()
    if not new_item or not new_item.is_available:
        raise HTTPException(status_code=400, detail="New item is not available or does not exist")

    before = {"item_id": detail.item_id, "unit_price": str(detail.unit_price)}
    
    # Update to new item
    detail.item_id = new_item.id
    detail.unit_price = new_item.price
    
    db.flush()
    
    # Recalculate order total
    recalculate_order_total(db, detail.order_id)
    
    audit_service.write_audit_log(
        db, actor_id, actor_role, "substitute_item", "order_detail", detail_id, 
        before, {"item_id": detail.item_id, "unit_price": str(detail.unit_price)}
    )
    db.commit()

    order = db.query(Order).filter(Order.id == detail.order_id).first()
    await ws_manager.broadcast(f"orders:{order.session_id}", WSEvent.create("ORDER_UPDATED", {"order_id": order.id}))
    # Thông báo KDS: món đổi sang món mới, trả về màu bình thường
    await ws_manager.broadcast("kitchen", WSEvent.create("ITEM_SUBSTITUTED", {
        "order_detail_id": detail_id,
        "old_item_id": before["item_id"],
        "new_item_id": detail.item_id,
    }))
    db.refresh(detail)
    return detail
