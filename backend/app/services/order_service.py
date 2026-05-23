# services/order_service.py — Order creation + management
# backend.rule.md Section 4.2

from datetime import date
from decimal import Decimal
from fastapi import HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.models.menu_item import MenuItem
from app.models.order import Order
from app.models.order_detail import OrderDetail
from app.models.session import Session
from app.models.tax_config import TaxConfig
from app.schemas.order import OrderCreate
from app.services import state_machine, audit_service
from app.websocket.manager import ws_manager
from app.websocket.events import WSEvent


async def create_order(db: DBSession, session_id: int, data: OrderCreate) -> Order:
    """Create order following backend.rule.md Section 4.2 checklist."""
    session = db.query(Session).filter(Session.id == session_id, Session.status == "open").first()
    if not session:
        raise HTTPException(status_code=400, detail="Session not found or not open")

    from app.core.redis import get_redis
    redis = await get_redis()
    if redis:
        is_busy = await redis.get("kitchen_busy_mode")
        if is_busy == b"1":
            raise HTTPException(status_code=429, detail="Nhà bếp đang quá tải, tạm thời không thể nhận thêm đơn mới")

    item_ids = [i.item_id for i in data.items]
    menu_items = db.query(MenuItem).filter(MenuItem.id.in_(item_ids)).all()
    menu_map = {m.id: m for m in menu_items}

    for item in data.items:
        if item.item_id not in menu_map:
            raise HTTPException(status_code=404, detail=f"Menu item {item.item_id} not found")
        if not menu_map[item.item_id].is_available:
            raise HTTPException(status_code=400, detail=f"Item '{menu_map[item.item_id].name}' unavailable")

    tax_config = db.query(TaxConfig).filter(TaxConfig.effective_from <= date.today()).order_by(TaxConfig.effective_from.desc()).first()
    vat_rate = Decimal(str(tax_config.vat_rate)) if tax_config else Decimal("0")
    svc_rate = Decimal(str(tax_config.service_charge_rate)) if tax_config else Decimal("0")

    subtotal = Decimal("0")
    details_data = []
    for item in data.items:
        up = Decimal(str(menu_map[item.item_id].price))
        subtotal += up * item.quantity
        details_data.append({"item_id": item.item_id, "quantity": item.quantity, "unit_price": up, "note": item.note})

    tax_amount = (subtotal * vat_rate).quantize(Decimal("0.01"))
    service_charge = (subtotal * svc_rate).quantize(Decimal("0.01"))
    total_price = subtotal + tax_amount + service_charge

    order = Order(session_id=session_id, subtotal=subtotal, tax_amount=tax_amount, service_charge=service_charge, total_price=total_price)
    db.add(order)
    db.flush()

    for d in details_data:
        db.add(OrderDetail(order_id=order.id, **d))

    audit_service.write_audit_log(db, None, "customer", "create_order", "order", order.id, {}, {"order_status": "pending", "total": str(total_price)})
    db.commit()
    db.refresh(order)

    await ws_manager.broadcast("staff", WSEvent.create("NEW_ORDER", {"order_id": order.id, "session_id": session_id, "table_id": session.table_id, "total": str(total_price)}))
    return order


async def confirm_order(db: DBSession, order_id: int, actor_id: int, actor_role: str) -> Order:
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order or order.order_status != "pending":
        raise HTTPException(status_code=400, detail="Order not found or not pending")

    order.order_status = "confirmed"
    for d in db.query(OrderDetail).filter(OrderDetail.order_id == order_id, OrderDetail.cooking_status == "pending").all():
        state_machine.validate_order_detail_transition("pending", "confirmed", actor_role)
        d.cooking_status = "confirmed"

    audit_service.write_audit_log(db, actor_id, actor_role, "confirm_order", "order", order_id, {"order_status": "pending"}, {"order_status": "confirmed"})
    db.commit()

    await ws_manager.broadcast("kitchen", WSEvent.create("NEW_ORDER_CONFIRMED", {"order_id": order_id}))
    await ws_manager.broadcast(f"orders:{order.session_id}", WSEvent.create("ORDER_UPDATED", {"order_id": order_id, "status": "confirmed"}))
    db.refresh(order)
    return order


async def reject_order(db: DBSession, order_id: int, actor_id: int, actor_role: str) -> Order:
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order or order.order_status != "pending":
        raise HTTPException(status_code=400, detail="Order not found or not pending")

    order.order_status = "cancelled"
    for d in db.query(OrderDetail).filter(OrderDetail.order_id == order_id).all():
        d.cooking_status = "cancelled"
        d.cancel_reason = "Order rejected"
        d.cancelled_by = actor_id

    audit_service.write_audit_log(db, actor_id, actor_role, "reject_order", "order", order_id, {"order_status": "pending"}, {"order_status": "cancelled"})
    db.commit()

    await ws_manager.broadcast(f"orders:{order.session_id}", WSEvent.create("ORDER_UPDATED", {"order_id": order_id, "status": "cancelled"}))
    db.refresh(order)
    return order


def get_order(db: DBSession, order_id: int) -> Order:
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


def get_pending_orders(db: DBSession) -> list[Order]:
    return db.query(Order).filter(Order.order_status == "pending").order_by(Order.created_at).all()


def recalculate_order_total(db: DBSession, order_id: int) -> Order:
    """BR-002: Recalculate after item cancellation."""
    order = db.query(Order).filter(Order.id == order_id).with_for_update().first()
    if not order:
        return None

    active = db.query(OrderDetail).filter(OrderDetail.order_id == order_id, OrderDetail.cooking_status != "cancelled").all()
    subtotal = sum(Decimal(str(d.unit_price)) * d.quantity for d in active)

    if order.subtotal and order.subtotal > 0:
        vat_ratio = Decimal(str(order.tax_amount)) / Decimal(str(order.subtotal))
        svc_ratio = Decimal(str(order.service_charge)) / Decimal(str(order.subtotal))
    else:
        vat_ratio = svc_ratio = Decimal("0")

    order.subtotal = subtotal
    order.tax_amount = (subtotal * vat_ratio).quantize(Decimal("0.01"))
    order.service_charge = (subtotal * svc_ratio).quantize(Decimal("0.01"))
    order.total_price = order.subtotal + order.tax_amount + order.service_charge
    return order


async def update_pending_order(db: DBSession, order_id: int, items_data: list, actor_id: int, actor_role: str) -> Order:
    """Update details of a pending order before confirmation. Delete details not requested."""
    order = db.query(Order).filter(Order.id == order_id).with_for_update().first()
    if not order or order.order_status != "pending":
        raise HTTPException(status_code=400, detail="Order not found or not pending")

    if not items_data:
        # If no items are requested, reject/cancel the entire order
        return await reject_order(db, order_id, actor_id, actor_role)

    item_ids = [i["item_id"] for i in items_data]
    menu_items = db.query(MenuItem).filter(MenuItem.id.in_(item_ids)).all()
    menu_map = {m.id: m for m in menu_items}

    for item in items_data:
        if item["item_id"] not in menu_map:
            raise HTTPException(status_code=404, detail=f"Menu item {item['item_id']} not found")
        if not menu_map[item["item_id"]].is_available:
            raise HTTPException(status_code=400, detail=f"Item '{menu_map[item['item_id']].name}' is unavailable")

    tax_config = db.query(TaxConfig).filter(TaxConfig.effective_from <= date.today()).order_by(TaxConfig.effective_from.desc()).first()
    vat_rate = Decimal(str(tax_config.vat_rate)) if tax_config else Decimal("0")
    svc_rate = Decimal(str(tax_config.service_charge_rate)) if tax_config else Decimal("0")

    existing_details = db.query(OrderDetail).filter(OrderDetail.order_id == order_id).all()
    existing_map = {d.item_id: d for d in existing_details}

    requested_item_ids = set(item_ids)

    # Delete details not in update list
    for d in existing_details:
        if d.item_id not in requested_item_ids:
            db.delete(d)

    subtotal = Decimal("0")
    for item in items_data:
        qty = item["quantity"]
        note = item.get("note")
        item_id = item["item_id"]
        up = Decimal(str(menu_map[item_id].price))
        subtotal += up * qty

        if item_id in existing_map:
            d = existing_map[item_id]
            d.quantity = qty
            d.note = note
            d.unit_price = up
        else:
            db.add(OrderDetail(order_id=order_id, item_id=item_id, quantity=qty, unit_price=up, note=note))

    tax_amount = (subtotal * vat_rate).quantize(Decimal("0.01"))
    service_charge = (subtotal * svc_rate).quantize(Decimal("0.01"))
    total_price = subtotal + tax_amount + service_charge

    old_total = order.total_price
    order.subtotal = subtotal
    order.tax_amount = tax_amount
    order.service_charge = service_charge
    order.total_price = total_price

    audit_service.write_audit_log(
        db, actor_id, actor_role, "update_order", "order", order_id,
        {"total": str(old_total)}, {"total": str(total_price)}
    )
    db.commit()
    db.refresh(order)

    await ws_manager.broadcast("staff", WSEvent.create("ORDER_UPDATED", {"order_id": order_id, "session_id": order.session_id, "table_id": order.session.table_id, "total": str(total_price)}))
    await ws_manager.broadcast(f"orders:{order.session_id}", WSEvent.create("ORDER_UPDATED", {"order_id": order_id, "status": "pending"}))
    return order

