# routers/customer.py — Customer API (ERS Section 7.1)
# Auth: X-Session-ID header (not JWT)

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session as DBSession

from app.core.database import get_db
from app.middleware.auth import get_current_session
from app.middleware.rate_limiter import rate_limit_orders
from app.models.session import Session
from app.schemas.order import OrderCreate, OrderResponse
from app.schemas.common import api_response
from app.services import order_service, session_service, kitchen_service, menu_service, payment_service

router = APIRouter(prefix="/api", tags=["Customer"])


@router.get("/tables/{table_number}/session")
def get_session(table_number: int, db: DBSession = Depends(get_db)):
    """QR scan → get or create session."""
    session = session_service.get_or_create_session(db, table_number)
    return api_response({"session_id": session.id, "table_id": session.table_id, "status": session.status})


@router.get("/menu")
def get_menu(db: DBSession = Depends(get_db)):
    """Get full menu (available items only)."""
    menu = menu_service.get_menu(db)
    return api_response(menu)


@router.post("/orders")
async def create_order(
    data: OrderCreate,
    request: Request,
    session: Session = Depends(get_current_session),
    db: DBSession = Depends(get_db),
):
    """Create new order within session (rate limited: 10/min)."""
    await rate_limit_orders(request, session.id)
    order = await order_service.create_order(db, session.id, data)
    return api_response({"order_id": order.id, "total_price": str(order.total_price), "status": order.order_status})


@router.get("/orders/{order_id}")
def get_order(order_id: int, session: Session = Depends(get_current_session), db: DBSession = Depends(get_db)):
    """Get order status and details."""
    order = order_service.get_order(db, order_id)
    return api_response(OrderResponse.model_validate(order))


@router.patch("/order-details/{detail_id}/cancel")
async def cancel_item(detail_id: int, session: Session = Depends(get_current_session), db: DBSession = Depends(get_db)):
    """Cancel item in pending status (Customer)."""
    result = await kitchen_service.cancel_order_detail(db, detail_id, actor_id=None, actor_role="customer")
    return api_response({"detail_id": result.id, "cooking_status": result.cooking_status})


@router.post("/sessions/{session_id}/payment-request")
async def request_payment(session_id: int, session: Session = Depends(get_current_session), db: DBSession = Depends(get_db)):
    """Request payment for session."""
    result = await session_service.request_payment(db, session_id)
    return api_response({"session_id": result.id, "status": result.status})


@router.get("/invoice")
async def get_customer_invoice(session: Session = Depends(get_current_session), db: DBSession = Depends(get_db)):
    """Get current invoice for session."""
    invoice = payment_service.get_invoice(db, session.id)
    return api_response(invoice)
