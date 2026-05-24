# app/main.py — FastAPI Application Factory
# backend.rule.md Section 1

from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import get_db
from app.core.redis import get_redis, close_redis
from app.core.security import decode_access_token
from app.routers import auth, customer, staff, cashier, kitchen, admin, report, report_menu_performance, report_trends, report_service_speed, report_fraud
from app.websocket.manager import ws_manager
from app.models.session import Session


from app.services.background_tasks import auto_confirm_loop
from app.services.best_seller_service import update_best_sellers_cache
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import asyncio

scheduler = AsyncIOScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    # Startup: init Redis connection
    await get_redis()
    
    # Start background tasks
    bg_task = asyncio.create_task(auto_confirm_loop())
    
    # Setup scheduler for 2:00 AM daily
    scheduler.add_job(
        func=lambda: asyncio.create_task(update_best_sellers_cache(next(get_db()))),
        trigger="cron",
        hour=2,
        minute=0
    )
    scheduler.start()

    # Calculate initially on startup
    asyncio.create_task(update_best_sellers_cache(next(get_db())))
    
    yield
    
    # Shutdown
    scheduler.shutdown()
    bg_task.cancel()
    await close_redis()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
)

# CORS: Only explicit origins, never "*" (backend.rule.md Section 8)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Include all routers ───
# NOTE: Staff/Kitchen/Admin mount BEFORE Customer to avoid route conflicts
# (e.g. /api/orders/pending must not match /api/orders/{order_id})
app.include_router(auth.router)
app.include_router(staff.router)
app.include_router(kitchen.router)
app.include_router(cashier.router)
app.include_router(admin.router)
app.include_router(customer.router)
app.include_router(report.router)
app.include_router(report_menu_performance.router)
app.include_router(report_trends.router)
app.include_router(report_service_speed.router)
app.include_router(report_fraud.router)


# ─── Health Check (devops.rule.md Section 7.3) ───
@app.get("/health")
async def health():
    """Basic health check."""
    health_status = {"status": "ok", "db": "ok", "redis": "ok"}
    try:
        redis = await get_redis()
        await redis.ping()
    except Exception:
        health_status["redis"] = "error"
    return health_status


# ─── WebSocket Endpoints (backend.rule.md Section 6.4) ───
@app.websocket("/ws/orders/{session_id}")
async def ws_customer(websocket: WebSocket, session_id: int):
    """WebSocket for customer — authenticated via session_id."""
    db = next(get_db())
    try:
        session = db.query(Session).filter(Session.id == session_id, Session.status.in_(["open", "waiting_payment"])).first()
        if not session:
            await websocket.close(code=4001)
            return

        channel = f"orders:{session_id}"
        await ws_manager.connect(websocket, channel)
        try:
            while True:
                await websocket.receive_text()  # Keep connection alive
        except WebSocketDisconnect:
            await ws_manager.disconnect(websocket, channel)
    finally:
        db.close()


@app.websocket("/ws/staff")
async def ws_staff(websocket: WebSocket, token: str = Query(...)):
    """WebSocket for staff — JWT in query param."""
    payload = decode_access_token(token)
    if not payload or payload.get("role", "") not in ("staff", "manager", "admin"):
        await websocket.close(code=4001)
        return

    await ws_manager.connect(websocket, "staff")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket, "staff")


@app.websocket("/ws/kitchen")
async def ws_kitchen(websocket: WebSocket, token: str = Query(...)):
    """WebSocket for kitchen display system."""
    payload = decode_access_token(token)
    if not payload or payload.get("role", "") not in ("kitchen", "admin"):
        await websocket.close(code=4001)
        return

    await ws_manager.connect(websocket, "kitchen")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket, "kitchen")


@app.websocket("/ws/cashier")
async def ws_cashier(websocket: WebSocket, token: str = Query(...)):
    """WebSocket for cashier."""
    payload = decode_access_token(token)
    if not payload or payload.get("role", "") not in ("cashier", "admin"):
        await websocket.close(code=4001)
        return

    await ws_manager.connect(websocket, "cashier")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket, "cashier")
