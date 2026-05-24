# routers/report_service_speed.py — Service Speed Report
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import func, and_, text
from sqlalchemy.orm import Session as DBSession

from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.rbac import require_roles
from app.models.staff_user import StaffUser
from app.models.order import Order
from app.models.order_detail import OrderDetail
from app.models.audit_log import AuditLog
from app.models.menu_item import MenuItem
from app.schemas.common import api_response

router = APIRouter(prefix="/api/reports/service-speed", tags=["Reports"])

@router.get("/detailed")
def get_service_speed_detailed(
    date_from: str = Query(..., description="Start date (YYYY-MM-DD)"),
    date_to: str = Query(..., description="End date (YYYY-MM-DD)"),
    category_id: Optional[int] = Query(None, description="Filter by category"),
    staff_id: Optional[int] = Query(None, description="Filter by staff"),
    group_by: str = Query("day", description="hour, day, staff, or category"),
    current_user: StaffUser = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    require_roles("admin", "manager")(current_user)
    try:
        start_dt = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
        end_dt = datetime.fromisoformat(date_to).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    # In a real DB we'd self-join audit_logs to calculate exact time diffs per stage
    # For now, we simulate this with the updated_at vs created_at and use Python to group,
    # as cross-db compatible complex time diff joins are hard without pure raw SQL.
    # We will simulate the summary and breakdown for the spec.
    import random
    
    # Base query to get served items
    base_query = db.query(OrderDetail, MenuItem, Order)\
        .join(MenuItem, OrderDetail.item_id == MenuItem.id)\
        .join(Order, OrderDetail.order_id == Order.id)\
        .filter(
            OrderDetail.cooking_status == "served",
            Order.created_at >= start_dt,
            Order.created_at <= end_dt
        )
        
    if category_id:
        base_query = base_query.filter(MenuItem.category_id == category_id)
        
    items = base_query.all()
    
    from collections import defaultdict
    
    logs = db.query(AuditLog.entity_id, AuditLog.after_state, AuditLog.created_at)\
             .filter(AuditLog.entity_type == "order_detail",
                     AuditLog.created_at >= start_dt,
                     AuditLog.created_at <= end_dt).all()
                     
    logs_by_item = defaultdict(dict)
    for log in logs:
        status = log.after_state.get("cooking_status") if log.after_state and isinstance(log.after_state, dict) else None
        if status:
            if status not in logs_by_item[log.entity_id]:
                logs_by_item[log.entity_id][status] = log.created_at
    
    metrics = {
        "p2c": {"sum": 0, "count": 0},
        "c2k": {"sum": 0, "count": 0},
        "k2d": {"sum": 0, "count": 0},
        "d2s": {"sum": 0, "count": 0}
    }
    
    # Store item stats for bottlenecks
    item_stats_map = defaultdict(lambda: {"item_name": "", "count": 0, "total_cooking_sec": 0})
    
    # For day/hour breakdown
    breakdown_data = defaultdict(lambda: {
        "p2c": {"sum": 0, "count": 0},
        "c2k": {"sum": 0, "count": 0},
        "k2d": {"sum": 0, "count": 0},
        "d2s": {"sum": 0, "count": 0}
    })
    
    for od, mi, order in items:
        times = logs_by_item.get(od.id, {})
        t_pending = od.created_at
        t_confirmed = times.get("confirmed")
        t_cooking = times.get("cooking")
        t_done = times.get("done")
        t_served = times.get("served")
        
        # Calculate diffs
        if not t_confirmed and t_cooking:
            p2c = (t_cooking - t_pending).total_seconds()
            c2k = 0
        else:
            p2c = (t_confirmed - t_pending).total_seconds() if t_confirmed else None
            c2k = (t_cooking - t_confirmed).total_seconds() if t_cooking and t_confirmed else None
            
        k2d = (t_done - t_cooking).total_seconds() if t_done and t_cooking else None
        d2s = (t_served - t_done).total_seconds() if t_served and t_done else None
        
        # Add to global metrics
        if p2c is not None and p2c >= 0:
            metrics["p2c"]["sum"] += p2c
            metrics["p2c"]["count"] += 1
        if c2k is not None and c2k >= 0:
            metrics["c2k"]["sum"] += c2k
            metrics["c2k"]["count"] += 1
        if k2d is not None and k2d >= 0:
            metrics["k2d"]["sum"] += k2d
            metrics["k2d"]["count"] += 1
            # Add to item specific cooking time
            item_stats_map[mi.id]["item_name"] = mi.name
            item_stats_map[mi.id]["count"] += 1
            item_stats_map[mi.id]["total_cooking_sec"] += k2d
        if d2s is not None and d2s >= 0:
            metrics["d2s"]["sum"] += d2s
            metrics["d2s"]["count"] += 1
            
        # Add to breakdown
        local_dt = od.created_at + timedelta(hours=7) # UTC+7
        if group_by == "hour":
            label = f"{local_dt.hour:02d}:00 - {(local_dt.hour+1)%24:02d}:00"
        else: # day
            days_map = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
            label = days_map[local_dt.weekday()]
            
        b = breakdown_data[label]
        if p2c is not None and p2c >= 0: b["p2c"]["sum"] += p2c; b["p2c"]["count"] += 1
        if c2k is not None and c2k >= 0: b["c2k"]["sum"] += c2k; b["c2k"]["count"] += 1
        if k2d is not None and k2d >= 0: b["k2d"]["sum"] += k2d; b["k2d"]["count"] += 1
        if d2s is not None and d2s >= 0: b["d2s"]["sum"] += d2s; b["d2s"]["count"] += 1
    
    # Calculate mock averages based on number of items
    count = len(items)
    
    avg_pending_to_confirmed_sec = metrics["p2c"]["sum"] / metrics["p2c"]["count"] if metrics["p2c"]["count"] > 0 else 0
    avg_confirmed_to_cooking_sec = metrics["c2k"]["sum"] / metrics["c2k"]["count"] if metrics["c2k"]["count"] > 0 else 0
    avg_cooking_to_done_sec = metrics["k2d"]["sum"] / metrics["k2d"]["count"] if metrics["k2d"]["count"] > 0 else 0
    avg_done_to_served_sec = metrics["d2s"]["sum"] / metrics["d2s"]["count"] if metrics["d2s"]["count"] > 0 else 0
    
    summary = {
        "avg_pending_to_confirmed_sec": round(avg_pending_to_confirmed_sec),
        "avg_confirmed_to_cooking_sec": round(avg_confirmed_to_cooking_sec),
        "avg_cooking_to_done_sec": round(avg_cooking_to_done_sec),
        "avg_done_to_served_sec": round(avg_done_to_served_sec),
        "avg_total_sec": round(avg_pending_to_confirmed_sec + avg_confirmed_to_cooking_sec + avg_cooking_to_done_sec + avg_done_to_served_sec)
    }
    
    breakdown = []
    # Ensure standard ordering
    if group_by == "hour":
        labels = [f"{i:02d}:00 - {(i+1)%24:02d}:00" for i in range(8, 23)]
    else:
        labels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
        
    for label in labels:
        b = breakdown_data.get(label)
        if b and any(b[k]["count"] > 0 for k in ["p2c", "c2k", "k2d", "d2s"]):
            sample_count = max(b["p2c"]["count"], b["c2k"]["count"], b["k2d"]["count"], b["d2s"]["count"])
            breakdown.append({
                "label": label,
                "pending_to_confirmed": round(b["p2c"]["sum"] / b["p2c"]["count"]) if b["p2c"]["count"] > 0 else 0,
                "confirmed_to_cooking": round(b["c2k"]["sum"] / b["c2k"]["count"]) if b["c2k"]["count"] > 0 else 0,
                "cooking_to_done": round(b["k2d"]["sum"] / b["k2d"]["count"]) if b["k2d"]["count"] > 0 else 0,
                "done_to_served": round(b["d2s"]["sum"] / b["d2s"]["count"]) if b["d2s"]["count"] > 0 else 0,
                "sample_count": sample_count
            })
            
    slowest_items = []
    for k, v in item_stats_map.items():
        if v["count"] > 0:
            slowest_items.append({
                "item_name": v["item_name"],
                "avg_cooking_sec": round(v["total_cooking_sec"] / v["count"]),
                "count": v["count"]
            })
            
    slowest_items.sort(key=lambda x: x["avg_cooking_sec"], reverse=True)
    slowest_items = slowest_items[:10]

    return api_response({
        "summary": summary,
        "breakdown": breakdown,
        "slowest_items": slowest_items
    })

@router.get("/bottlenecks")
def get_bottlenecks(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: StaffUser = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    require_roles("admin", "manager")(current_user)
    
    # Find actual bottlenecks
    bottlenecks = []
    try:
        start_dt = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc) if date_from else None
        end_dt = datetime.fromisoformat(date_to).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc) if date_to else None
    except ValueError:
        pass
        
    query = db.query(OrderDetail, MenuItem)\
        .join(MenuItem, OrderDetail.item_id == MenuItem.id)\
        .order_by(OrderDetail.id.desc())
        
    if start_dt and end_dt:
        query = query.filter(OrderDetail.created_at >= start_dt, OrderDetail.created_at <= end_dt)
        
    items = query.limit(500).all()
    
    logs = db.query(AuditLog.entity_id, AuditLog.after_state, AuditLog.created_at, AuditLog.actor_id)\
             .filter(AuditLog.entity_type == "order_detail")
    if start_dt and end_dt:
        logs = logs.filter(AuditLog.created_at >= start_dt, AuditLog.created_at <= end_dt)
    logs = logs.all()
    
    from collections import defaultdict
    logs_by_item = defaultdict(dict)
    actor_by_item = defaultdict(dict)
    for log in logs:
        status = log.after_state.get("cooking_status") if log.after_state and isinstance(log.after_state, dict) else None
        if status:
            if status not in logs_by_item[log.entity_id]:
                logs_by_item[log.entity_id][status] = log.created_at
                actor_by_item[log.entity_id][status] = log.actor_id
                
    for od, mi in items:
        times = logs_by_item.get(od.id, {})
        t_pending = od.created_at
        t_confirmed = times.get("confirmed")
        t_cooking = times.get("cooking")
        t_done = times.get("done")
        
        if not t_confirmed and t_cooking:
            p2c = (t_cooking - t_pending).total_seconds()
            c2k = 0
            t_confirmed = t_cooking
        else:
            p2c = (t_confirmed - t_pending).total_seconds() if t_confirmed else None
            c2k = (t_cooking - t_confirmed).total_seconds() if t_cooking and t_confirmed else None
            
        k2d = (t_done - t_cooking).total_seconds() if t_done and t_cooking else None
        
        # Define some actual threshold limits
        THRESH_P2C = 180 # 3 minutes to confirm
        THRESH_K2D = 1200 # 20 minutes to cook
        
        if p2c and p2c > THRESH_P2C:
            bottlenecks.append({
                "order_detail_id": od.id,
                "item_name": mi.name,
                "stage": "pending → confirmed",
                "duration_sec": round(p2c),
                "threshold_sec": THRESH_P2C,
                "occurred_at": od.created_at.isoformat(),
                "staff_name": f"Staff ID: {actor_by_item.get(od.id, {}).get('confirmed') or 'Unknown'}"
            })
            
        if k2d and k2d > THRESH_K2D:
            bottlenecks.append({
                "order_detail_id": od.id,
                "item_name": mi.name,
                "stage": "cooking → done",
                "duration_sec": round(k2d),
                "threshold_sec": THRESH_K2D,
                "occurred_at": t_cooking.isoformat(),
                "staff_name": f"Staff ID: {actor_by_item.get(od.id, {}).get('done') or 'Unknown'}"
            })
            
    bottlenecks.sort(key=lambda x: x["duration_sec"] - x["threshold_sec"], reverse=True)
    bottlenecks = bottlenecks[:20]

    return api_response(bottlenecks)
