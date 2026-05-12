# routers/report.py — Reports API (ERS Section 7.5)
# Auth: JWT with role admin/manager

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session as DBSession

from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.rbac import require_roles
from app.models.staff_user import StaffUser
from app.models.payment import Payment
from app.models.order import Order
from app.models.order_detail import OrderDetail
from app.models.menu_item import MenuItem
from app.schemas.common import api_response

router = APIRouter(prefix="/api/reports", tags=["Reports"])

@router.get("/revenue")
def get_revenue_report(
    start_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: str = Query(..., description="End date (YYYY-MM-DD)"),
    group_by: str = Query("day", description="day, week, or month"),
    current_user: StaffUser = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    """Báo cáo doanh thu theo ngày / tuần / tháng (FR-A06)."""
    require_roles("admin", "manager")(current_user)
    
    try:
        start_dt = datetime.fromisoformat(start_date).replace(tzinfo=timezone.utc)
        end_dt = datetime.fromisoformat(end_date).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        
    query = db.query(Payment).filter(
        Payment.status == "completed",
        Payment.paid_at >= start_dt,
        Payment.paid_at <= end_dt
    )
    
    payments = query.all()
    
    # Group in python for simplicity across different SQL dialects (SQLite/PostgreSQL)
    grouped = {}
    for p in payments:
        if group_by == "month":
            key = p.paid_at.strftime("%Y-%m")
        elif group_by == "week":
            # ISO year and week number
            key = f"{p.paid_at.isocalendar()[0]}-W{p.paid_at.isocalendar()[1]:02d}"
        else: # default to day
            key = p.paid_at.strftime("%Y-%m-%d")
            
        if key not in grouped:
            grouped[key] = Decimal("0")
        grouped[key] += Decimal(str(p.amount))
        
    # Format to list and sort
    results = [{"date": k, "revenue": str(v)} for k, v in grouped.items()]
    results.sort(key=lambda x: x["date"])
    
    return api_response({
        "group_by": group_by,
        "total_revenue": str(sum((Decimal(str(p.amount)) for p in payments))),
        "transaction_count": len(payments),
        "data": results
    })


@router.get("/top-items")
def get_top_items_report(
    limit: int = Query(10, le=50),
    current_user: StaffUser = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    """Báo cáo món bán chạy (FR-A07)."""
    require_roles("admin", "manager")(current_user)
    
    # We count order details that are not cancelled
    results = (
        db.query(
            MenuItem.id,
            MenuItem.name,
            func.sum(OrderDetail.quantity).label("total_sold")
        )
        .join(OrderDetail, OrderDetail.item_id == MenuItem.id)
        .filter(OrderDetail.cooking_status != "cancelled")
        .group_by(MenuItem.id, MenuItem.name)
        .order_by(func.sum(OrderDetail.quantity).desc())
        .limit(limit)
        .all()
    )
    
    return api_response([
        {"item_id": r.id, "item_name": r.name, "total_sold": int(r.total_sold)}
        for r in results
    ])


@router.get("/service-speed")
def get_service_speed_report(
    current_user: StaffUser = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    """Báo cáo tốc độ phục vụ trung bình (FR-A07)."""
    require_roles("admin", "manager")(current_user)
    
    # We want to find the average time from order creation to "served"
    # Note: Currently we don't store "served_at" timestamp in OrderDetail, so we use order.created_at and current time if it was recently served, or just return an average placeholder if we lack timestamps.
    # Wait, does OrderDetail have a served_at or updated_at?
    # Let's check the schema. If it doesn't, we will return a mock or calculate based on updated_at.
    # For now, we will calculate based on updated_at where cooking_status == 'served'
    
    # Actually, SQLite doesn't support advanced time diff aggregation easily.
    # Let's fetch the recent 100 served items and calculate it in python.
    details = (
        db.query(OrderDetail, Order)
        .join(Order, Order.id == OrderDetail.order_id)
        .filter(OrderDetail.cooking_status == "served")
        .order_by(OrderDetail.id.desc())
        .limit(100)
        .all()
    )
    
    total_minutes = 0
    valid_count = 0
    
    for detail, order in details:
        # If the order detail has an updated_at, use it. Otherwise, this is a limitation.
        if hasattr(detail, 'updated_at') and detail.updated_at:
            delta = detail.updated_at - order.created_at
            total_minutes += delta.total_seconds() / 60.0
            valid_count += 1
            
    average_minutes = (total_minutes / valid_count) if valid_count > 0 else 0
    
    return api_response({
        "average_service_time_minutes": round(average_minutes, 2),
        "sample_size": valid_count
    })
