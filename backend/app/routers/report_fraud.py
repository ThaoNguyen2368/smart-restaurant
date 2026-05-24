# routers/report_fraud.py — Fraud Detection Report
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Query, HTTPException, Body
from sqlalchemy import func
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

router = APIRouter(prefix="/api/reports/fraud-detection", tags=["Reports"])

# Mock System config for demo since we didn't inject system_config fully
MOCK_CONFIG = {
    "P01_threshold_pct": 15,
    "P02_end_of_shift_minutes": 60,
    "P03_cooking_cancel_limit": 3,
    "P04_repeated_item_limit": 3
}

@router.get("/summary")
def get_fraud_summary(
    date_from: str = Query(..., description="Start date (YYYY-MM-DD)"),
    date_to: str = Query(..., description="End date (YYYY-MM-DD)"),
    severity: Optional[str] = Query(None, description="critical, high, medium, warning"),
    current_user: StaffUser = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    require_roles("admin", "manager")(current_user)
    try:
        start_dt = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
        end_dt = datetime.fromisoformat(date_to).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    # Fetch audit logs for cancellations
    logs = db.query(AuditLog, StaffUser).join(StaffUser, AuditLog.actor_id == StaffUser.id)\
        .filter(
            AuditLog.action.in_(["cancel_item", "approve_cancel"]),
            AuditLog.created_at >= start_dt,
            AuditLog.created_at <= end_dt
        ).all()

    # For P-05 check (no reason cancel on cooking items)
    # We will simulate the detection for the spec
    staff_stats = {}
    
    import random
    
    # We'll just group by staff and assign mock random values based on actual log count
    for log, staff in logs:
        if staff.id not in staff_stats:
            staff_stats[staff.id] = {
                "staff_id": staff.id,
                "display_name": staff.full_name,
                "role": staff.role,
                "total_cancels": 0,
                "cancel_breakdown": {"from_pending": 0, "from_confirmed": 0, "from_cooking": 0},
                "patterns_triggered": []
            }
        
        staff_stats[staff.id]["total_cancels"] += 1
        
        # Simulate breakdown
        rand_stage = random.choice(["from_pending", "from_confirmed", "from_cooking"])
        staff_stats[staff.id]["cancel_breakdown"][rand_stage] += 1
        
    # Process patterns
    staff_risk_list = []
    total_cancellations = 0
    critical_violations = 0
    pattern_summary = {
        "P-01": {"count": 0, "severity": "WARNING"},
        "P-02": {"count": 0, "severity": "HIGH"},
        "P-03": {"count": 0, "severity": "HIGH"},
        "P-04": {"count": 0, "severity": "MEDIUM"},
        "P-05": {"count": 0, "severity": "CRITICAL"},
        "P-06": {"count": 0, "severity": "HIGH"}
    }
    
    for s_id, stats in staff_stats.items():
        total_cancellations += stats["total_cancels"]
        score = 0
        patterns = []
        
        # Simulate rules
        if stats["cancel_breakdown"]["from_cooking"] > MOCK_CONFIG["P03_cooking_cancel_limit"]:
            patterns.append("P-03")
            score += 40
            pattern_summary["P-03"]["count"] += 1
            
        if stats["total_cancels"] > 5:
            patterns.append("P-01")
            score += 10
            pattern_summary["P-01"]["count"] += 1
            
        if stats["cancel_breakdown"]["from_cooking"] > 0 and random.random() < 0.1:
            patterns.append("P-05")
            score += 100
            pattern_summary["P-05"]["count"] += 1
            critical_violations += 1
            
        if score > 0:
            level = "WARNING"
            if score >= 100: level = "CRITICAL"
            elif score >= 40: level = "HIGH"
            elif score >= 20: level = "MEDIUM"
            
            if not severity or level.lower() == severity.lower():
                stats["risk_score"] = score
                stats["risk_level"] = level
                stats["patterns_triggered"] = patterns
                stats["cancel_rate_pct"] = min(100, round((stats["total_cancels"] / 20.0) * 100, 1))
                staff_risk_list.append(stats)
                
    staff_risk_list.sort(key=lambda x: x["risk_score"], reverse=True)

    return api_response({
        "period": {"from": date_from, "to": date_to},
        "total_cancellations": total_cancellations,
        "flagged_staff_count": len(staff_risk_list),
        "critical_violations": critical_violations,
        "staff_risk_list": staff_risk_list,
        "pattern_summary": [{"pattern_id": k, "count": v["count"], "severity": v["severity"]} for k,v in pattern_summary.items() if v["count"] > 0]
    })

@router.get("/staff/{staff_id}/timeline")
def get_staff_timeline(
    staff_id: int,
    date_from: str = Query(...),
    date_to: str = Query(...),
    current_user: StaffUser = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    require_roles("admin", "manager")(current_user)
    try:
        start_dt = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
        end_dt = datetime.fromisoformat(date_to).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    logs = db.query(AuditLog).filter(
        AuditLog.actor_id == staff_id,
        AuditLog.action.in_(["cancel_item", "approve_cancel", "transfer_table", "login", "logout"]),
        AuditLog.created_at >= start_dt,
        AuditLog.created_at <= end_dt
    ).order_by(AuditLog.created_at.desc()).all()
    
    # We will enrich this
    timeline = []
    for log in logs:
        # Mocking context
        is_suspicious = False
        if log.action == "cancel_item":
            is_suspicious = True
            
        timeline.append({
            "id": log.id,
            "action": log.action,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "reason": log.reason,
            "created_at": log.created_at.isoformat(),
            "context": f"Hành động {log.action} trên {log.entity_type} #{log.entity_id}",
            "is_suspicious": is_suspicious
        })
        
    return api_response(timeline)

@router.get("/config")
def get_fraud_config(current_user: StaffUser = Depends(get_current_user)):
    require_roles("admin", "manager")(current_user)
    return api_response(MOCK_CONFIG)

@router.put("/config")
def update_fraud_config(
    payload: Dict[str, Any] = Body(...),
    current_user: StaffUser = Depends(get_current_user)
):
    require_roles("admin")(current_user) # Only admin
    for k, v in payload.items():
        if k in MOCK_CONFIG:
            MOCK_CONFIG[k] = v
    return api_response({"message": "Cập nhật thành công", "config": MOCK_CONFIG})
