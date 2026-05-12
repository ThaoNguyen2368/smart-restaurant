import asyncio
import logging
from datetime import datetime, timezone

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.redis import get_redis
from app.models.order import Order
from app.services import order_service
from app.websocket.manager import ws_manager
from app.websocket.events import WSEvent

logger = logging.getLogger(__name__)

async def auto_confirm_loop():
    """
    Background loop that runs periodically to check for pending orders
    that have exceeded the reminder or escalation timeouts.
    """
    logger.info("Starting Auto-confirm background loop...")
    while True:
        try:
            await check_pending_orders()
        except asyncio.CancelledError:
            logger.info("Auto-confirm background loop cancelled.")
            break
        except Exception as e:
            logger.error(f"Error in auto_confirm_loop: {e}")
        
        # Check every 30 seconds
        await asyncio.sleep(30)

async def check_pending_orders():
    # We use a distinct DB session per loop execution
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        # Fetch orders that are still pending
        pending_orders = db.query(Order).filter(Order.order_status == "pending").all()
        
        redis = await get_redis()
        
        for order in pending_orders:
            # Calculate elapsed time in minutes
            if order.created_at.tzinfo is None:
                created_at = order.created_at.replace(tzinfo=timezone.utc)
            else:
                created_at = order.created_at
            
            elapsed_td = now - created_at
            elapsed_minutes = elapsed_td.total_seconds() / 60.0
            
            # Check Escalation
            if elapsed_minutes >= settings.ORDER_ESCALATION_MINUTES:
                escalation_key = f"order:escalated:{order.id}"
                # Use Redis NX to ensure we only process this once even with multiple workers
                if await redis.set(escalation_key, "1", ex=3600, nx=True):
                    logger.warning(f"Order {order.id} escalated! Pending for {elapsed_minutes:.1f} mins.")
                    
                    if settings.AUTO_CONFIRM_ENABLED:
                        logger.info(f"Auto-confirming order {order.id}...")
                        # We use actor_id=None or a system actor ID. Here we'll just pass None and "admin" role
                        # so that require_roles in router is bypassed (since we call service directly).
                        try:
                            # Note: confirm_order internally broadcasts to KDS and updates status
                            await order_service.confirm_order(db, order.id, actor_id=1, actor_role="system")
                            await ws_manager.broadcast("staff", WSEvent.create("ORDER_ESCALATION", {
                                "order_id": order.id,
                                "message": f"Order {order.id} was AUTO-CONFIRMED after {settings.ORDER_ESCALATION_MINUTES} minutes."
                            }))
                        except Exception as e:
                            logger.error(f"Failed to auto-confirm order {order.id}: {e}")
                    else:
                        await ws_manager.broadcast("staff", WSEvent.create("ORDER_ESCALATION", {
                            "order_id": order.id,
                            "message": f"ESCALATION: Order {order.id} pending for over {settings.ORDER_ESCALATION_MINUTES} minutes!"
                        }))
            
            # Check Reminder
            elif elapsed_minutes >= settings.ORDER_REMINDER_MINUTES:
                reminder_key = f"order:reminded:{order.id}"
                if await redis.set(reminder_key, "1", ex=3600, nx=True):
                    logger.info(f"Order {order.id} reminder sent. Pending for {elapsed_minutes:.1f} mins.")
                    await ws_manager.broadcast("staff", WSEvent.create("ORDER_REMINDER", {
                        "order_id": order.id,
                        "message": f"REMINDER: Order {order.id} pending for over {settings.ORDER_REMINDER_MINUTES} minutes."
                    }))

    finally:
        db.close()
