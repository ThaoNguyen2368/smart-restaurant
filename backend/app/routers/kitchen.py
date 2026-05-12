# routers/kitchen.py — Kitchen API (ERS Section 7.4)
# Auth: JWT with role kitchen

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession

from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.rbac import require_roles
from app.models.staff_user import StaffUser
from app.schemas.order import CookingStatusUpdate
from app.schemas.common import api_response
from app.services import kitchen_service, menu_service
from pydantic import BaseModel

class KitchenStatusUpdate(BaseModel):
    busy_mode: bool

router = APIRouter(prefix="/api", tags=["Kitchen"])


@router.get("/kitchen/queue")
def get_queue(category_id: int | None = None, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """Get cooking queue (FIFO). Optionally filter by category."""
    user = require_roles("kitchen", "admin")(current_user)
    queue = kitchen_service.get_kitchen_queue(db, category_id=category_id)
    return api_response(queue)


@router.patch("/order-details/{detail_id}/status")
async def update_status(detail_id: int, data: CookingStatusUpdate, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """Update cooking status (confirmed→cooking, cooking→done)."""
    user = require_roles("kitchen", "admin")(current_user)
    result = await kitchen_service.update_cooking_status(db, detail_id, data.cooking_status, user.id)
    return api_response({"detail_id": result.id, "cooking_status": result.cooking_status})


@router.post("/menu-items/{item_id}/out-of-stock")
async def report_out_of_stock(item_id: int, current_user: StaffUser = Depends(get_current_user), db: DBSession = Depends(get_db)):
    """Report item out of stock (BR-009)."""
    user = require_roles("kitchen", "admin")(current_user)
    item = await menu_service.mark_out_of_stock(db, item_id)
    return api_response({"item_id": item.id, "is_available": item.is_available})

@router.get("/kitchen/status")
async def get_kitchen_status(current_user: StaffUser = Depends(get_current_user)):
    """Get current kitchen busy mode status."""
    require_roles("kitchen", "staff", "manager", "admin")(current_user)
    from app.core.redis import get_redis
    redis = await get_redis()
    is_busy = False
    if redis:
        val = await redis.get("kitchen_busy_mode")
        is_busy = val == b"1"
    return api_response({"busy_mode": is_busy})

@router.patch("/kitchen/status")
async def update_kitchen_status(data: KitchenStatusUpdate, current_user: StaffUser = Depends(get_current_user)):
    """Update kitchen busy mode and notify staff (FR-K06)."""
    user = require_roles("kitchen", "manager", "admin")(current_user)
    from app.core.redis import get_redis
    redis = await get_redis()
    if redis:
        await redis.set("kitchen_busy_mode", "1" if data.busy_mode else "0")
        
    from app.websocket.manager import ws_manager
    from app.websocket.events import WSEvent
    await ws_manager.broadcast("staff", WSEvent.create("KITCHEN_BUSY_MODE_CHANGED", {"busy_mode": data.busy_mode}))
    
    return api_response({"busy_mode": data.busy_mode})
