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
        AuditLog.action.in_(["update_status_cooking", "update_status_confirmed"]),
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
            
        # Generate actual daily series for sparkline
        # For simplicity and performance in demo, we'll do 7 daily bins
        daily_series = {"current": [], "previous": []}
        
        # Build 7-bin series
        bin_duration = (now - current_start) / 7
        for i in range(7):
            bin_start = current_start + (bin_duration * i)
            bin_end = current_start + (bin_duration * (i + 1))
            kpis_bin = calculate_kpis(db, bin_start, bin_end)
            daily_series["current"].append(max(0, kpis_bin.get(kpi["id"], 0)))
            
            p_bin_start = previous_start + (bin_duration * i)
            p_bin_end = previous_start + (bin_duration * (i + 1))
            p_kpis_bin = calculate_kpis(db, p_bin_start, p_bin_end)
            daily_series["previous"].append(max(0, p_kpis_bin.get(kpi["id"], 0)))
        
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
    
    # Actual drill-down data
    try:
        start_dt = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
        end_dt = datetime.fromisoformat(date_to).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")
        
    breakdown_data = []
    
    # We will slice the date range based on breakdown
    # For staff, we don't slice by time, but group by staff
    if breakdown == "staff":
        staff_list = db.query(StaffUser).all()
        for staff in staff_list:
            if kpi_id == "KPI-01":
                val = db.query(func.avg(func.extract('epoch', AuditLog.created_at - OrderDetail.created_at)))\
                    .join(OrderDetail, AuditLog.entity_id == OrderDetail.id)\
                    .filter(AuditLog.action.in_(["update_status_cooking", "update_status_confirmed"]), AuditLog.entity_type == "order_detail", AuditLog.actor_id == staff.id, AuditLog.created_at >= start_dt, AuditLog.created_at <= end_dt).scalar()
                samples = db.query(func.count(AuditLog.id))\
                    .filter(AuditLog.action.in_(["update_status_cooking", "update_status_confirmed"]), AuditLog.entity_type == "order_detail", AuditLog.actor_id == staff.id, AuditLog.created_at >= start_dt, AuditLog.created_at <= end_dt).scalar() or 0
                if samples > 0: breakdown_data.append({"label": staff.full_name, "value": float(val or 0), "sample_size": samples})
            elif kpi_id == "KPI-02":
                total = db.query(func.count(OrderDetail.id)).filter(OrderDetail.created_at >= start_dt, OrderDetail.created_at <= end_dt).scalar() or 1
                val = db.query(func.count(OrderDetail.id)).filter(OrderDetail.cooking_status == 'cancelled', OrderDetail.cancelled_by == staff.id, OrderDetail.cancelled_at >= start_dt, OrderDetail.cancelled_at <= end_dt).scalar() or 0
                if val > 0: breakdown_data.append({"label": staff.full_name, "value": (val/total)*100.0, "sample_size": val})
            elif kpi_id == "KPI-03":
                val = db.query(func.count(AuditLog.id)).filter(AuditLog.action == "transfer_table", AuditLog.actor_id == staff.id, AuditLog.created_at >= start_dt, AuditLog.created_at <= end_dt).scalar() or 0
                if val > 0: breakdown_data.append({"label": staff.full_name, "value": val, "sample_size": val})
            # Skip KPI-04/05 for staff as they are harder to assign
    else:
        # Time-based slicing
        if breakdown == "hour":
            slices = 15 # 8:00 to 23:00
            step = timedelta(hours=1)
            base_t = start_dt.replace(hour=8, minute=0, second=0)
        else:
            slices = (end_dt - start_dt).days + 1
            step = timedelta(days=1)
            base_t = start_dt.replace(hour=0, minute=0, second=0)
            
        for i in range(slices):
            s_dt = base_t + step * i
            e_dt = s_dt + step
            
            # Don't query out of bounds
            if s_dt > end_dt: break
            
            if breakdown == "hour":
                label = f"{s_dt.hour:02d}:00"
            else:
                days_map = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
                label = days_map[s_dt.weekday()]
                
            kpis = calculate_kpis(db, s_dt, e_dt)
            val = kpis.get(kpi_id, 0)
            
            # Estimate sample size based on total orders
            samples = db.query(func.count(Order.id)).filter(Order.created_at >= s_dt, Order.created_at <= e_dt).scalar() or 0
            
            if val > 0 or samples > 0:
                breakdown_data.append({
                    "label": label,
                    "value": val,
                    "sample_size": samples
                })
                
    # Sort for non-time series
    if breakdown == "staff":
        breakdown_data.sort(key=lambda x: x["value"], reverse=True)
        
    return api_response(breakdown_data)
