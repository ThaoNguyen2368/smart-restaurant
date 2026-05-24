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


from fastapi import BackgroundTasks

def assign_split_bill(db: DBSession, session_id: int, request: SplitBillRequest, actor_id: int, background_tasks: BackgroundTasks = None) -> dict:
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
    if background_tasks:
        background_tasks.add_task(ws_manager.broadcast, "cashier", WSEvent.create("SPLIT_BILL_UPDATED", {"session_id": session_id}))
    
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
            
    # --- LOGIC MỚI: XỬ LÝ LÀM TRÒN SPLIT BILL CHUẨN XÁC TỚI TỪNG ĐỒNG ---
    group_keys = list(groups.keys())
    accumulated_tax = Decimal("0")
    accumulated_svc = Decimal("0")
    accumulated_total = Decimal("0")

    for i, lbl in enumerate(group_keys):
        g = groups[lbl]
        
        # Nếu là nhóm cuối cùng, gánh toàn bộ phần dư của tổng tiền để không bị lệch bill
        if i == len(group_keys) - 1:
            g["tax_amount"] = tax - accumulated_tax
            g["service_charge"] = svc - accumulated_svc
            g["total"] = total - accumulated_total
        else:
            proportion = (g["subtotal"] / subtotal) if subtotal > Decimal("0") else Decimal("0")
            
            g_tax = (tax * proportion).quantize(Decimal("0.01"))
            g_svc = (svc * proportion).quantize(Decimal("0.01"))
            g_total = (total * proportion).quantize(Decimal("0.01"))
            
            g["tax_amount"] = g_tax
            g["service_charge"] = g_svc
            g["total"] = g_total
            
            accumulated_tax += g_tax
            accumulated_svc += g_svc
            accumulated_total += g_total

        # Tính toán tiền đã trả và còn lại của nhóm
        group_payments = [Decimal(str(p.amount)) for p in payments if (p.split_label or "Unassigned") == lbl and p.status == "completed"]
        g["total_paid"] = sum(group_payments)
        g["remaining"] = max(Decimal("0"), g["total"] - g["total_paid"])

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
    """Get total payments for current shift."""
    from datetime import datetime, timezone
    from app.models.shift import CashierShift
    from decimal import Decimal
    
    # Tìm ca hiện tại đang mở
    shift = db.query(CashierShift).filter(CashierShift.cashier_id == cashier_id, CashierShift.end_time == None).first()
    
    if not shift:
        # Nếu chưa có ca, tự động tạo ca mới
        shift = CashierShift(cashier_id=cashier_id, start_time=datetime.now(timezone.utc))
        db.add(shift)
        db.commit()
        db.refresh(shift)
        
    payments = (
        db.query(Payment)
        .filter(Payment.cashier_id == cashier_id, Payment.paid_at >= shift.start_time, Payment.status == "completed")
        .all()
    )
    
    total = sum(Decimal(str(p.amount)) for p in payments)
    
    methods = {}
    for p in payments:
        pm = p.payment_method.lower() if p.payment_method else "unknown"
        if pm not in methods:
            methods[pm] = Decimal("0")
        methods[pm] += Decimal(str(p.amount))
        
    return {
        "cashier_id": cashier_id,
        "shift_start": shift.start_time,
        "total_collected": total,
        "payments_by_method": methods,
        "transaction_count": len(payments),
        "payments": payments
    }

def close_shift(db: DBSession, cashier_id: int, actual_cash: Decimal) -> dict:
    from app.models.shift import CashierShift
    from datetime import datetime, timezone
    
    shift = db.query(CashierShift).filter(CashierShift.cashier_id == cashier_id, CashierShift.end_time == None).first()
    if not shift:
        raise HTTPException(status_code=400, detail="No active shift found")
        
    summary = get_shift_summary(db, cashier_id)
    system_cash = summary["payments_by_method"].get("cash", Decimal("0"))
    
    shift.end_time = datetime.now(timezone.utc)
    shift.system_total = system_cash
    shift.actual_total = actual_cash
    shift.difference = actual_cash - system_cash
    
    db.commit()
    
    return {"message": "Shift closed successfully", "shift_id": shift.id, "difference": shift.difference}
