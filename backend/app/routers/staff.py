# routers/staff.py — Staff API (ERS Section 7.2)
# Auth: JWT with role staff/manager/admin

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession

from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.rbac import require_roles
from app.models.staff_user import StaffUser
from app.models.table import Table
from app.schemas.session import TableTransferRequest, SessionResponse
from app.schemas.order import CancelRequest, OrderResponse, SubstituteItemRequest
from app.schemas.common import api_response
from app.services import order_service, session_service, kitchen_service

router = APIRouter(prefix="/api", tags=["Staff"])


@router.get("/tables")
def get_tables(current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """Table map and real-time status."""
    tables = db.query(Table).order_by(Table.table_number).all()
    return api_response([
        {"id": t.id, "table_number": t.table_number, "status": t.status, "floor": t.floor, "qr_code_url": t.qr_code_url}
        for t in tables
    ])


@router.get("/orders/pending")
def get_pending_orders(current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """List orders awaiting confirmation."""
    orders = order_service.get_pending_orders(db)
    res = []
    for o in orders:
        data = OrderResponse.model_validate(o).model_dump()
        data["table_id"] = o.session.table_id
        res.append(data)
    return api_response(res)


@router.patch("/orders/{order_id}/confirm")
async def confirm_order(order_id: int, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """Confirm order → send to kitchen."""
    user = require_roles("staff", "manager", "admin")(current_user)
    order = await order_service.confirm_order(db, order_id, user.id, user.role)
    return api_response({"order_id": order.id, "status": order.order_status})


@router.patch("/orders/{order_id}/reject")
async def reject_order(order_id: int, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """Reject order."""
    user = require_roles("staff", "manager", "admin")(current_user)
    order = await order_service.reject_order(db, order_id, user.id, user.role)
    return api_response({"order_id": order.id, "status": order.order_status})


@router.patch("/order-details/{detail_id}/cancel")
async def cancel_detail(detail_id: int, data: CancelRequest, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """Cancel item (pending/confirmed)."""
    user = require_roles("staff", "manager", "admin")(current_user)
    result = await kitchen_service.cancel_order_detail(db, detail_id, user.id, user.role, data.cancel_reason)
    return api_response({"detail_id": result.id, "cooking_status": result.cooking_status})


@router.post("/order-details/{detail_id}/cancel-request")
async def propose_cancel(detail_id: int, data: CancelRequest, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """Propose cancel for cooking item → requires Manager approval (BR-003)."""
    user = require_roles("staff", "manager", "admin")(current_user)
    if user.role in ("manager", "admin"):
        result = await kitchen_service.cancel_order_detail(db, detail_id, user.id, user.role, data.cancel_reason)
        return api_response({"detail_id": result.id, "cooking_status": result.cooking_status})
    from app.websocket.manager import ws_manager
    from app.websocket.events import WSEvent
    await ws_manager.broadcast("staff", WSEvent.create("CANCEL_REQUEST_PENDING", {"order_detail_id": detail_id, "requested_by": user.id, "reason": data.cancel_reason}))
    return api_response({"message": "Cancel request submitted, awaiting Manager approval"})


@router.patch("/sessions/{session_id}/transfer-table")
async def transfer_table(session_id: int, data: TableTransferRequest, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """Transfer session to another table (BR-011)."""
    user = require_roles("staff", "manager", "admin")(current_user)
    session = await session_service.transfer_table(db, session_id, data.destination_table_id, user.id, user.role)
    return api_response({"session_id": session.id, "new_table_id": session.table_id})


@router.patch("/order-details/{detail_id}/served")
async def mark_served(detail_id: int, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """Mark item as served (done → served)."""
    user = require_roles("staff", "manager", "admin")(current_user)
    result = await kitchen_service.mark_served(db, detail_id, user.id, user.role)
    return api_response({"detail_id": result.id, "cooking_status": result.cooking_status})

@router.patch("/order-details/{detail_id}/substitute")
async def substitute_item(detail_id: int, data: SubstituteItemRequest, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """Substitute an out-of-stock item with a new one (BR-009)."""
    user = require_roles("staff", "manager", "admin")(current_user)
    result = await kitchen_service.substitute_order_detail(db, detail_id, data.new_item_id, user.id, user.role)
    return api_response({"detail_id": result.id, "new_item_id": result.item_id, "cooking_status": result.cooking_status})

@router.get("/tables/{table_id}/sessions/today")
def get_table_sessions(table_id: int, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """Xem lịch sử phiên trong ngày theo từng bàn (FR-S10)."""
    user = require_roles("staff", "manager", "admin")(current_user)
    sessions = session_service.get_today_sessions_for_table(db, table_id)
    return api_response([SessionResponse.model_validate(s).model_dump() for s in sessions])
