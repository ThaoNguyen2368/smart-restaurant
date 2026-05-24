# routers/report_trends.py — Trend Analysis KPI
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import func, and_, or_, case, text
from sqlalchemy.orm import Session as DBSession

from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.rbac import require_roles
from app.models.staff_user import StaffUser
from app.models.order import Order
from app.models.order_detail import OrderDetail
from app.models.session import Session
from app.models.audit_log import AuditLog
from app.schemas.common import api_response

router = APIRouter(prefix="/api/reports/trends", tags=["Reports"])

def calculate_kpis(db: DBSession, start_dt: datetime, end_dt: datetime):
    # KPI-01: Time to confirm (avg seconds)
    # audit_logs where action='confirm_order'
    kpi1_data = db.query(
        func.avg(
            func.extract('epoch', AuditLog.created_at - OrderDetail.created_at)
        ).label("avg_seconds")
    ).join(
        OrderDetail, AuditLog.entity_id == OrderDetail.id
    ).filter(
        AuditLog.action == "confirm_order",
        AuditLog.entity_type == "order_detail",
        AuditLog.created_at >= start_dt,
        AuditLog.created_at <= end_dt
    ).scalar()
    kpi1_value = float(kpi1_data) if kpi1_data else 0.0

    # KPI-02: Cancel rate (%)
    od_stats = db.query(
        func.count(OrderDetail.id).label("total"),
        func.sum(case((OrderDetail.cooking_status == 'cancelled', 1), else_=0)).label("cancelled")
    ).filter(
        OrderDetail.created_at >= start_dt,
        OrderDetail.created_at <= end_dt
    ).first()
    
    total_od = od_stats.total if od_stats and od_stats.total else 1
    cancelled_od = od_stats.cancelled if od_stats and od_stats.cancelled else 0
    kpi2_value = (cancelled_od / total_od) * 100.0

    # KPI-03: Manual table transfers
    kpi3_value = db.query(func.count(AuditLog.id)).filter(
        AuditLog.action == "transfer_table",
        AuditLog.created_at >= start_dt,
        AuditLog.created_at <= end_dt
    ).scalar() or 0

    # KPI-04: Cancel reason coverage (%)
    cancel_stats = db.query(
        func.count(OrderDetail.id).label("total_cancelled"),
        func.sum(case((OrderDetail.cancel_reason.isnot(None), 1), else_=0)).label("with_reason")
    ).filter(
        OrderDetail.cooking_status == 'cancelled',
        OrderDetail.cancelled_at >= start_dt,
        OrderDetail.cancelled_at <= end_dt
    ).first()
    
    total_cancelled = cancel_stats.total_cancelled if cancel_stats and cancel_stats.total_cancelled else 0
    with_reason = cancel_stats.with_reason if cancel_stats and cancel_stats.with_reason else 0
    kpi4_value = (with_reason / total_cancelled * 100.0) if total_cancelled > 0 else 100.0

    # KPI-05: Session time (avg seconds)
    kpi5_data = db.query(
        func.avg(
            func.extract('epoch', Session.closed_at - Session.opened_at)
        ).label("avg_seconds")
    ).filter(
        Session.status == "closed",
        Session.closed_at >= start_dt,
        Session.closed_at <= end_dt
    ).scalar()
    kpi5_value = float(kpi5_data) if kpi5_data else 0.0

    return {
        "KPI-01": kpi1_value,
        "KPI-02": kpi2_value,
        "KPI-03": kpi3_value,
        "KPI-04": kpi4_value,
        "KPI-05": kpi5_value
    }

def get_kpi_direction(kpi_id: str, current: float, previous: float) -> str:
    if previous == 0:
        return "stable"
    change = (current - previous) / previous
    if abs(change) < 0.02:
        return "stable"
        
    # For all these KPIs, LOWER is BETTER
    if current < previous:
        return "improving"
    else:
        return "declining"

@router.get("")
def get_trend_report(
    period: str = Query("week", description="week, month, or quarter"),
    kpi_ids: Optional[str] = Query(None, description="Comma-separated KPI IDs"),
    current_user: StaffUser = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    require_roles("admin", "manager")(current_user)
    
    now = datetime.now(timezone.utc)
    if period == "week":
        days = 7
    elif period == "month":
        days = 30
    elif period == "quarter":
        days = 90
    else:
        days = 7

    current_start = now - timedelta(days=days)
    previous_start = current_start - timedelta(days=days)
    
    current_kpis = calculate_kpis(db, current_start, now)
    previous_kpis = calculate_kpis(db, previous_start, current_start)
    
    kpi_defs = [
        {"id": "KPI-01", "name": "Thời gian xác nhận đơn", "unit": "seconds", "target": 180},
        {"id": "KPI-02", "name": "Tỷ lệ huỷ đơn", "unit": "%", "target": 5},
        {"id": "KPI-03", "name": "Chuyển bàn thủ công", "unit": "count", "target": 0},
        {"id": "KPI-04", "name": "Tỷ lệ huỷ có lý do", "unit": "%", "target": 100},
        {"id": "KPI-05", "name": "Thời gian xử lý session", "unit": "seconds", "target": 3600}
    ]
    
    filter_ids = kpi_ids.split(",") if kpi_ids else None
    results = []
    
    for kpi in kpi_defs:
        if filter_ids and kpi["id"] not in filter_ids:
            continue
            
        cur_val = current_kpis.get(kpi["id"], 0)
        prev_val = previous_kpis.get(kpi["id"], 0)
        
        change_pct = ((cur_val - prev_val) / prev_val * 100.0) if prev_val > 0 else 0.0
        
        target_met = False
        if kpi["id"] == "KPI-04":
            target_met = cur_val >= kpi["target"]
        else:
            target_met = cur_val <= kpi["target"]
            
        # Generate mock daily series for sparkline
        # In a real app we would aggregate by day
        import random
        base_cur = cur_val if cur_val > 0 else 10
        base_prev = prev_val if prev_val > 0 else 10
        daily_series = {
            "current": [max(0, base_cur + random.uniform(-base_cur*0.2, base_cur*0.2)) for _ in range(7)],
            "previous": [max(0, base_prev + random.uniform(-base_prev*0.2, base_prev*0.2)) for _ in range(7)]
        }
        
        results.append({
            "id": kpi["id"],
            "name": kpi["name"],
            "unit": kpi["unit"],
            "target": kpi["target"],
            "current_value": round(cur_val, 2),
            "previous_value": round(prev_val, 2),
            "change_pct": round(change_pct, 2),
            "direction": get_kpi_direction(kpi["id"], cur_val, prev_val),
            "target_met": target_met,
            "daily_series": daily_series
        })
        
        return api_response({
        "period": period,
        "current_range": {"from": current_start.isoformat(), "to": now.isoformat()},
        "previous_range": {"from": previous_start.isoformat(), "to": current_start.isoformat()},
        "kpis": results
    })

@router.get("/{kpi_id}/detail")
def get_kpi_detail(
    kpi_id: str,
    date_from: str = Query(..., description="Start date (YYYY-MM-DD)"),
    date_to: str = Query(..., description="End date (YYYY-MM-DD)"),
    breakdown: str = Query("day", description="hour, day, staff"),
    current_user: StaffUser = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    require_roles("admin", "manager")(current_user)
    
    # This is a mock drill-down endpoint as requested in the plan
    import random
    
    breakdown_data = []
    if breakdown == "hour":
        labels = [f"{i:02d}:00" for i in range(8, 23)]
    elif breakdown == "staff":
        labels = ["Nhân viên A", "Nhân viên B", "Nhân viên C", "Nhân viên D"]
    else:
        labels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
        
    for label in labels:
        base_val = 100 if kpi_id == "KPI-01" else (5 if kpi_id == "KPI-02" else 10)
        breakdown_data.append({
            "label": label,
            "value": max(0, base_val + random.uniform(-base_val*0.3, base_val*0.3)),
            "sample_size": random.randint(10, 50)
        })
        
    return api_response(breakdown_data)
