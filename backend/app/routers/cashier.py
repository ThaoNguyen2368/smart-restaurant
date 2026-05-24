# routers/cashier.py — Cashier API (ERS Section 7.3)
# Auth: JWT with role cashier/admin — BR-006 Segregation of Duties

from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session as DBSession

from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.rbac import require_roles
from app.models.staff_user import StaffUser
from app.models.table import Table
from app.models.session import Session
from app.schemas.payment import PaymentCreate, SplitBillRequest
from app.schemas.common import api_response
from app.services import payment_service, session_service

router = APIRouter(prefix="/api", tags=["Cashier"])


@router.get("/sessions/{session_id}/invoice")
def get_invoice(session_id: int, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """Get full invoice for a session."""
    user = require_roles("cashier", "admin")(current_user)
    invoice = payment_service.get_invoice(db, session_id)
    return api_response(invoice)


@router.get("/sessions/waiting-payment")
def get_waiting_payment_sessions(current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """Fetch all sessions currently waiting for payment."""
    require_roles("cashier", "admin")(current_user)
    sessions = (
        db.query(Session)
        .filter(Session.status == "waiting_payment")
        .order_by(Session.updated_at.desc().nullslast())
        .all()
    )
    result = [
        {"session_id": s.id, "table_id": s.table_id, "status": s.status, "received_at": s.updated_at.isoformat() if s.updated_at else s.opened_at.isoformat()}
        for s in sessions
    ]
    return api_response(result)


@router.get("/tables/{table_number}/active-session")
def get_active_session_by_table(
    table_number: int,
    current_user: StaffUser = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    """Resolve current active session from table number for cashier lookup."""
    require_roles("cashier", "admin")(current_user)
    table = db.query(Table).filter(Table.table_number == table_number).first()
    if not table:
        return api_response({"table_number": table_number, "session_id": None, "status": "table_not_found"})

    session = (
        db.query(Session)
        .filter(Session.table_id == table.id, Session.status.in_(["open", "waiting_payment"]))
        .order_by(Session.id.desc())
        .first()
    )
    if not session:
        return api_response({"table_number": table_number, "table_id": table.id, "session_id": None, "status": "no_active_session"})

    return api_response({"table_number": table_number, "table_id": table.id, "session_id": session.id, "status": session.status})


@router.post("/payments")
def create_payment(data: PaymentCreate, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """Record payment (Cashier only — BR-006)."""
    user = require_roles("cashier", "admin")(current_user)
    payment = payment_service.create_payment(db, data, user.id)
    return api_response({"payment_id": payment.id, "amount": str(payment.amount), "status": payment.status})


@router.patch("/sessions/{session_id}/close")
async def close_session(session_id: int, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """Close session after full payment (BR-010)."""
    user = require_roles("cashier", "admin")(current_user)
    session = await session_service.close_session(db, session_id, user.id)
    return api_response({"session_id": session.id, "status": session.status})


@router.post("/tables/{table_id}/reset")
async def reset_table(table_id: int, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """Reset table to empty after session closed."""
    user = require_roles("cashier", "staff", "manager", "admin")(current_user)
    table = await session_service.reset_table(db, table_id)
    return api_response({"table_id": table.id, "status": table.status})

@router.post("/sessions/{session_id}/split-bill")
def split_bill(session_id: int, data: SplitBillRequest, background_tasks: BackgroundTasks, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """Assign order details to specific split groups."""
    user = require_roles("cashier", "admin")(current_user)
    result = payment_service.assign_split_bill(db, session_id, data, user.id, background_tasks)
    return api_response(result)

@router.get("/shift-summary")
def get_shift_summary(current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """Xem lịch sử ca làm việc và tổng thu trong ca (FR-CA07)."""
    user = require_roles("cashier", "admin")(current_user)
    summary = payment_service.get_shift_summary(db, user.id)
    
    # Format Decimal objects to strings for JSON serialization
    summary["total_collected"] = str(summary["total_collected"])
    summary["payments_by_method"] = {k: str(v) for k, v in summary["payments_by_method"].items()}
    
    from app.schemas.payment import PaymentResponse
    summary["payments"] = [PaymentResponse.model_validate(p).model_dump() for p in summary["payments"]]
    
    return api_response(summary)

from pydantic import BaseModel
class CloseShiftRequest(BaseModel):
    actual_cash: float

@router.post("/shift-summary/close")
def close_shift(data: CloseShiftRequest, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """Close current shift and record actual cash."""
    from decimal import Decimal
    user = require_roles("cashier", "admin")(current_user)
    result = payment_service.close_shift(db, user.id, Decimal(str(data.actual_cash)))
    return api_response(result)
