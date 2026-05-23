# services/payment_service.py — Payment processing
# BR-006: Cashier role mandatory. BR-010: Session closes only when fully paid.

from decimal import Decimal
from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session as DBSession

from app.models.payment import Payment
from app.models.order import Order
from app.models.order_detail import OrderDetail
from app.models.session import Session
from app.services import audit_service
from app.schemas.payment import PaymentCreate, SplitBillRequest


def create_payment(db: DBSession, data: PaymentCreate, cashier_id: int) -> Payment:
    """Record a payment (Cashier only — BR-006)."""
    session = db.query(Session).filter(Session.id == data.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status not in ("open", "waiting_payment"):
        raise HTTPException(status_code=400, detail="Session is not in a payable state")

    payment = Payment(
        session_id=data.session_id,
        cashier_id=cashier_id,
        amount=data.amount,
        payment_method=data.payment_method,
        transaction_ref=data.transaction_ref,
        split_label=data.split_label,
        status="completed",
    )
    db.add(payment)

    audit_service.write_audit_log(db, cashier_id, "cashier", "process_payment", "payment", 0, {}, {"amount": str(data.amount), "method": data.payment_method})

    db.commit()
    db.refresh(payment)
    return payment


def assign_split_bill(db: DBSession, session_id: int, request: SplitBillRequest, actor_id: int) -> dict:
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Verify all order details belong to this session
    detail_ids = [item.order_detail_id for item in request.items]
    details = (
        db.query(OrderDetail)
        .join(Order, Order.id == OrderDetail.order_id)
        .filter(Order.session_id == session_id, OrderDetail.id.in_(detail_ids))
        .all()
    )
    
    if len(details) != len(detail_ids):
        raise HTTPException(status_code=400, detail="Some order details do not belong to this session or do not exist")
    
    update_map = {item.order_detail_id: item.split_label for item in request.items}
    for d in details:
        d.split_label = update_map[d.id]
        
    audit_service.write_audit_log(db, actor_id, "cashier", "split_bill", "session", session_id, {}, {"assigned_items": len(detail_ids)})
    db.commit()
    
    from app.websocket.manager import ws_manager
    from app.websocket.events import WSEvent
    import asyncio
    asyncio.create_task(ws_manager.broadcast("cashier", WSEvent.create("SPLIT_BILL_UPDATED", {"session_id": session_id})))
    
    return {"message": "Split bill assignments updated"}


def get_invoice(db: DBSession, session_id: int) -> dict:
    """Get full invoice for a session."""
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    table = session.table

    orders = db.query(Order).filter(Order.session_id == session_id, Order.order_status != "cancelled").all()

    subtotal = sum(Decimal(str(o.subtotal)) for o in orders)
    tax = sum(Decimal(str(o.tax_amount)) for o in orders)
    svc = sum(Decimal(str(o.service_charge)) for o in orders)
    total = sum(Decimal(str(o.total_price)) for o in orders)
    
    vat_rate = Decimal("0")
    svc_rate = Decimal("0")
    if subtotal > 0:
        vat_rate = (tax / subtotal).quantize(Decimal("0.01"))
        svc_rate = (svc / subtotal).quantize(Decimal("0.01"))

    payments = db.query(Payment).filter(Payment.session_id == session_id).all()
    total_paid = sum(Decimal(str(p.amount)) for p in payments if p.status == "completed")

    details = []
    groups = {}
    
    for o in orders:
        for d in o.order_details:
            lbl = d.split_label or "Unassigned"
            if lbl not in groups:
                groups[lbl] = {"subtotal": Decimal("0")}
                
            line_total = Decimal(str(d.unit_price)) * d.quantity
            groups[lbl]["subtotal"] += line_total
            
            details.append({
                "id": d.id,
                "item_id": d.item_id,
                "item_name": d.menu_item.name if d.menu_item else f"Item #{d.item_id}",
                "quantity": d.quantity,
                "unit_price": d.unit_price,
                "cooking_status": d.cooking_status,
                "split_label": d.split_label,
                "note": d.note,
                "updated_at": (d.updated_at or d.created_at).isoformat() if (d.updated_at or d.created_at) else None,
            })
            
    for lbl, g in groups.items():
        g["tax_amount"] = (g["subtotal"] * vat_rate).quantize(Decimal("0.01"))
        g["service_charge"] = (g["subtotal"] * svc_rate).quantize(Decimal("0.01"))
        g["total"] = g["subtotal"] + g["tax_amount"] + g["service_charge"]
        
        group_payments = [p.amount for p in payments if p.split_label == lbl and p.status == "completed"]
        g["total_paid"] = sum(Decimal(str(amt)) for amt in group_payments)
        g["remaining"] = g["total"] - g["total_paid"]

    return {
        "session_id": session_id,
        "table_id": session.table_id,
        "table_number": table.table_number if table else 0,
        "session_status": session.status,
        "table_status": table.status if table else None,
        "subtotal": subtotal,
        "tax_amount": tax,
        "service_charge": svc,
        "total": total,
        "vat_rate": vat_rate,
        "service_charge_rate": svc_rate,
        "payments": payments,
        "total_paid": total_paid,
        "remaining": total - total_paid,
        "details": details,
        "split_groups": groups,
    }


def get_shift_summary(db: DBSession, cashier_id: int) -> dict:
    """Get total payments for current shift (today)."""
    from datetime import datetime, timezone
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    
    payments = (
        db.query(Payment)
        .filter(Payment.cashier_id == cashier_id, Payment.paid_at >= today_start, Payment.status == "completed")
        .all()
    )
    
    total = sum(Decimal(str(p.amount)) for p in payments)
    
    methods = {}
    for p in payments:
        if p.payment_method not in methods:
            methods[p.payment_method] = Decimal("0")
        methods[p.payment_method] += Decimal(str(p.amount))
        
    return {
        "cashier_id": cashier_id,
        "shift_start": today_start,
        "total_collected": total,
        "payments_by_method": methods,
        "transaction_count": len(payments),
        "payments": payments
    }
