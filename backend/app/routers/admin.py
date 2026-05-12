# routers/admin.py — Admin/Manager API (ERS Section 7.5)
# Auth: JWT with role admin/manager

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session as DBSession

from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.rbac import require_roles
from app.models.staff_user import StaffUser
from app.models.audit_log import AuditLog
from app.models.tax_config import TaxConfig
from app.models.table import Table
from app.core.security import get_password_hash
from app.schemas.table import TableUpdate
from app.schemas.menu import MenuItemCreate, MenuItemUpdate, CategoryCreate, CategoryUpdate
from app.schemas.staff import StaffUserCreate, StaffUserUpdate
from app.schemas.session import SessionMergeRequest
from app.schemas.order import CancelApproval
from app.schemas.common import api_response
from app.services import menu_service, session_service, kitchen_service

router = APIRouter(prefix="/api", tags=["Admin"])


# ─── Menu CRUD (Admin only) ───
@router.post("/menu-items")
def create_item(data: MenuItemCreate, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    user = require_roles("admin")(current_user)
    item = menu_service.create_menu_item(db, data)
    return api_response({"id": item.id, "name": item.name, "price": str(item.price)})

@router.patch("/menu-items/{item_id}")
def update_item(item_id: int, data: MenuItemUpdate, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    user = require_roles("admin")(current_user)
    item = menu_service.update_menu_item(db, item_id, data)
    return api_response({"id": item.id, "name": item.name, "price": str(item.price)})

@router.get("/menu-items")
def list_all_items(current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    user = require_roles("admin")(current_user)
    items = menu_service.get_all_menu_items(db)
    return api_response([
        {"id": i.id, "category_id": i.category_id, "name": i.name, "price": str(i.price), "is_available": i.is_available}
        for i in items
    ])


# ─── Category CRUD (Admin only) ───
@router.post("/categories")
def create_cat(data: CategoryCreate, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    user = require_roles("admin")(current_user)
    cat = menu_service.create_category(db, data)
    return api_response({"id": cat.id, "name": cat.name})

@router.patch("/categories/{cat_id}")
def update_cat(cat_id: int, data: CategoryUpdate, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    user = require_roles("admin")(current_user)
    cat = menu_service.update_category(db, cat_id, data)
    return api_response({"id": cat.id, "name": cat.name})

@router.delete("/categories/{cat_id}")
def delete_cat(cat_id: int, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    user = require_roles("admin")(current_user)
    menu_service.delete_category(db, cat_id)
    return api_response({"message": "Category deleted"})


# ─── Staff CRUD (Admin only) ───
@router.post("/staff-users")
def create_staff(data: StaffUserCreate, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    user = require_roles("admin")(current_user)
    new_user = StaffUser(
        username=data.username,
        password_hash=get_password_hash(data.password),
        role=data.role,
        display_name=data.display_name,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return api_response({"id": new_user.id, "username": new_user.username, "role": new_user.role})

@router.patch("/staff-users/{user_id}")
def update_staff(user_id: int, data: StaffUserUpdate, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    user = require_roles("admin")(current_user)
    target = db.query(StaffUser).filter(StaffUser.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    update_data = data.model_dump(exclude_unset=True)
    if "password" in update_data:
        update_data["password_hash"] = get_password_hash(update_data.pop("password"))
    for k, v in update_data.items():
        setattr(target, k, v)
    db.commit()
    db.refresh(target)
    return api_response({"id": target.id, "username": target.username, "role": target.role, "is_active": target.is_active})

@router.get("/staff-users")
def list_staff(current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    user = require_roles("admin")(current_user)
    users = db.query(StaffUser).all()
    return api_response([
        {"id": u.id, "username": u.username, "role": u.role, "display_name": u.display_name, "is_active": u.is_active}
        for u in users
    ])


# ─── Tax Config (Admin only) ───
@router.get("/tax-config")
def get_tax(current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    user = require_roles("admin")(current_user)
    configs = db.query(TaxConfig).order_by(TaxConfig.effective_from.desc()).all()
    return api_response([
        {"id": c.id, "vat_rate": str(c.vat_rate), "service_charge_rate": str(c.service_charge_rate), "effective_from": str(c.effective_from)}
        for c in configs
    ])

@router.post("/tax-config")
def create_tax(vat_rate: float, service_charge_rate: float, effective_from: str, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    from datetime import date as d
    user = require_roles("admin")(current_user)
    config = TaxConfig(vat_rate=vat_rate, service_charge_rate=service_charge_rate, effective_from=d.fromisoformat(effective_from), created_by=user.id)
    db.add(config)
    db.commit()
    db.refresh(config)
    return api_response({"id": config.id, "vat_rate": str(config.vat_rate), "service_charge_rate": str(config.service_charge_rate)})


# ─── Table Management (Admin only) ───
@router.post("/tables")
def create_table(table_number: int, qr_code_url: str, floor: str = None, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    user = require_roles("admin")(current_user)
    table = Table(table_number=table_number, qr_code_url=qr_code_url, floor=floor)
    db.add(table)
    db.commit()
    db.refresh(table)
    return api_response({"id": table.id, "table_number": table.table_number, "status": table.status})

@router.patch("/tables/{table_id}")
def update_table(table_id: int, data: TableUpdate, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """Sửa thông tin bàn, tái tạo QR code (FR-A10)."""
    user = require_roles("admin")(current_user)
    table = db.query(Table).filter(Table.id == table_id).first()
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
        
    update_data = data.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(table, k, v)
        
    db.commit()
    db.refresh(table)
    return api_response({
        "id": table.id, 
        "table_number": table.table_number, 
        "qr_code_url": table.qr_code_url, 
        "floor": table.floor, 
        "status": table.status
    })


# ─── Session Merge (Manager+) ───
@router.post("/sessions/merge")
async def merge_sessions(data: SessionMergeRequest, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    user = require_roles("manager", "admin")(current_user)
    master = await session_service.merge_sessions(db, data.source_session_id, data.master_session_id, user.id)
    return api_response({"master_session_id": master.id})


# ─── Cancel Approval (Manager+) ───
@router.patch("/order-details/{detail_id}/approve-cancel")
async def approve_cancel(detail_id: int, data: CancelApproval, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    user = require_roles("manager", "admin")(current_user)
    if data.approved:
        result = await kitchen_service.cancel_order_detail(db, detail_id, user.id, user.role, data.reason)
        return api_response({"detail_id": result.id, "cooking_status": result.cooking_status})
    return api_response({"message": "Cancel request rejected"})


# ─── Audit Logs (Admin only, cursor-based pagination) ───
@router.get("/audit-logs")
def get_audit_logs(
    cursor: int = Query(None, description="Last audit_log ID for cursor pagination"),
    limit: int = Query(50, le=100),
    current_user: StaffUser = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    user = require_roles("admin")(current_user)
    query = db.query(AuditLog).order_by(AuditLog.id.desc())
    if cursor:
        query = query.filter(AuditLog.id < cursor)
    logs = query.limit(limit).all()
    next_cursor = logs[-1].id if logs else None
    return api_response({
        "logs": [
            {"id": l.id, "actor_type": l.actor_type, "action": l.action, "entity_type": l.entity_type, "entity_id": l.entity_id, "reason": l.reason, "created_at": str(l.created_at)}
            for l in logs
        ],
        "next_cursor": next_cursor,
    })
