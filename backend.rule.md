# backend.rule.md — Smart Restaurant OS
# Backend Engineering Rules

> **Tech Stack:** FastAPI (Python 3.11+) · PostgreSQL 15+ · Redis · JWT  
> **Read after:** `skill.md` → `domain.rule.md` → this file  
> **Applies to:** All backend services, API handlers, service layers, WebSocket handlers

---

## 1. Project Structure (Mandatory Layout)

```
backend/
├── app/
│   ├── main.py                     # FastAPI app factory
│   ├── core/
│   │   ├── config.py               # Settings (env-driven)
│   │   ├── security.py             # JWT, password hashing
│   │   ├── database.py             # DB session factory
│   │   └── redis.py                # Redis client
│   ├── models/                     # SQLAlchemy ORM models
│   │   ├── category.py
│   │   ├── menu_item.py
│   │   ├── staff_user.py
│   │   ├── tax_config.py
│   │   ├── table.py
│   │   ├── session.py
│   │   ├── order.py
│   │   ├── order_detail.py
│   │   ├── payment.py
│   │   └── audit_log.py
│   ├── schemas/                    # Pydantic request/response schemas
│   ├── services/                   # Business logic layer
│   │   ├── state_machine.py        # CENTRALISED state transition validator
│   │   ├── order_service.py
│   │   ├── session_service.py
│   │   ├── payment_service.py
│   │   ├── kitchen_service.py
│   │   ├── audit_service.py        # write_audit_log() helper
│   │   └── menu_service.py
│   ├── routers/                    # FastAPI route handlers (thin)
│   │   ├── customer.py
│   │   ├── staff.py
│   │   ├── cashier.py
│   │   ├── kitchen.py
│   │   └── admin.py
│   ├── websocket/
│   │   ├── manager.py              # WebSocket connection manager
│   │   └── events.py               # Typed event schema definitions
│   └── middleware/
│       ├── auth.py                 # JWT verification dependency
│       ├── rate_limiter.py
│       └── rbac.py                 # Role-based access control
├── migrations/                     # Alembic migration files
├── tests/
└── alembic.ini
```

---

## 2. API Conventions

### 2.1 URL Structure

```
/api/{resource}/{id}/{sub-action}

Examples (match ERS v2.0 exactly):
GET    /api/tables/{table_number}/session
POST   /api/orders
PATCH  /api/order-details/{id}/status
PATCH  /api/order-details/{id}/cancel
POST   /api/order-details/{id}/cancel-request
PATCH  /api/order-details/{id}/approve-cancel
PATCH  /api/sessions/{id}/transfer-table
POST   /api/sessions/{id}/split-bill
```

> **Rule:** API paths MUST match ERS Section 7 exactly. Do not rename, abbreviate, or restructure without a documented requirements change.

### 2.2 HTTP Method Semantics

| Method | Use Case |
|---|---|
| `GET` | Read-only, no side effects |
| `POST` | Create new resource or trigger action |
| `PATCH` | Partial update of specific fields |
| `PUT` | Full resource replacement (use only for tax-config update) |
| `DELETE` | FORBIDDEN for domain entities. Use soft delete. |

### 2.3 Response Format

**Success:**
```json
{
  "data": { ... },
  "meta": { "timestamp": "2025-01-01T10:00:00Z" }
}
```

**Error:**
```json
{
  "error": "BUSINESS_RULE_VIOLATION",
  "message": "Cannot cancel item in cooking status without Manager approval.",
  "code": "BR-003"
}
```

**Business rule error codes MUST map to BR-* identifiers from skill.md.**

### 2.4 Pagination

- Audit logs and order history: cursor-based pagination only.
- Do NOT use offset-based pagination for these endpoints (performance degrades at scale).

---

## 3. Authentication & RBAC

### 3.1 JWT Configuration

```python
ACCESS_TOKEN_EXPIRE_MINUTES = 15       # Hard requirement — ERS 9.3
REFRESH_TOKEN_EXPIRE_HOURS = 8         # One work shift
ALGORITHM = "HS256"                    # Minimum; RS256 preferred for multi-service
```

### 3.2 Role Permission Matrix

| Endpoint Category | customer | staff | cashier | manager | admin | kitchen |
|---|---|---|---|---|---|---|
| POST /api/orders | Session auth | ✗ | ✗ | ✗ | ✗ | ✗ |
| PATCH /api/orders/{id}/confirm | ✗ | ✓ | ✗ | ✓ | ✓ | ✗ |
| POST /api/payments | ✗ | ✗ | ✓ | ✗ | ✓ | ✗ |
| PATCH /api/order-details/{id}/approve-cancel | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ |
| POST /api/sessions/merge | ✗ | ✗ | ✗ | ✓ | ✓ | ✗ |
| GET /api/audit-logs | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| CRUD /api/menu-items | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| PATCH /api/order-details/{id}/status | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| POST /api/menu-items/{id}/out-of-stock | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |

> **Rule:** RBAC middleware must reject with `403 Forbidden` before any service logic executes. Never rely on service-layer role checks as the first line of defence.

### 3.3 Customer Authentication

- Customers authenticate via `X-Session-ID` header (not JWT).
- Session ID is validated server-side: must exist and have `status = 'open'`.
- Customers can only access their own session's data.
- WebSocket connection for customers: validate Session ID before upgrading.

---

## 4. Service Layer Rules

### 4.1 State Transition Validator (Mandatory Centralisation)

```python
# services/state_machine.py
# ALL state transitions for Session, OrderDetail, Table MUST go through this module.
# Route handlers MUST NOT inline state logic.

def validate_order_detail_transition(current_status: str, target_status: str, actor_role: str) -> bool:
    ...

def validate_session_transition(current_status: str, target_status: str, actor_role: str) -> bool:
    ...
```

**Forbidden pattern:**
```python
# ❌ NEVER do this in a route handler
if order_detail.cooking_status == "cooking":
    raise HTTPException(...)
```

**Required pattern:**
```python
# ✓ Always go through the validator
state_machine.validate_order_detail_transition(
    current_status=detail.cooking_status,
    target_status="cancelled",
    actor_role=current_user.role
)
```

### 4.2 Order Creation Checklist (POST /api/orders)

Implement ALL steps in order. Missing any step is a defect:

1. Validate Session ID exists and `status = 'open'`
2. Validate all `item_id` values exist and `is_available = TRUE`
3. Snapshot `unit_price` from current `menu_items.price` — NEVER use client-sent price
4. Look up active `Tax_Config` (latest `effective_from ≤ NOW()`)
5. Calculate `subtotal`, `tax_amount`, `service_charge`, `total_price` server-side
6. Create Order + OrderDetails in a SINGLE database transaction
7. Write AuditLog entry within the same transaction
8. Broadcast `NEW_ORDER` event to `/ws/staff` channel AFTER commit
9. Start 3-minute confirm timeout timer

### 4.3 Audit Log Helper (Mandatory Signature)

```python
# services/audit_service.py
def write_audit_log(
    db: Session,
    actor_id: int | None,
    actor_type: str,        # customer|staff|cashier|manager|admin|system
    action: str,            # cancel_item|approve_cancel|confirm_order|...
    entity_type: str,       # order_detail|order|session|payment
    entity_id: int,
    before_state: dict,
    after_state: dict,
    reason: str | None = None
) -> None:
    ...
```

- **Must be called within the same DB transaction as the state change.**
- If the transaction rolls back, the audit log entry rolls back too.
- `reason` MUST be provided and non-empty for all `cancel_item` actions where the item was in `cooking` status.

---

## 5. Database Transaction Safety

### 5.1 Atomicity Requirements

The following operations MUST execute in a single PostgreSQL transaction:

| Operation | Transaction Contents |
|---|---|
| Order creation | INSERT order + INSERT order_details (all) + INSERT audit_log |
| Status change | UPDATE order_detail + UPDATE order.total_price (if cancelled) + INSERT audit_log |
| Session close | UPDATE session.status + UPDATE table.status + validate all payments complete |
| Table transfer | UPDATE session.table_id + UPDATE old_table.status + UPDATE new_table.status + INSERT audit_log |
| Session merge | UPDATE all orders (re-assign session_id) + UPDATE merged session.status + INSERT audit_log |
| Cancellation (cooking) | Require 3-step approval gate, all within transaction on final approval step |

### 5.2 Concurrency

- Use `SELECT ... FOR UPDATE` (row-level locking) when checking table status before session creation.
- Use `SELECT ... FOR UPDATE` when updating `order.total_price` after detail cancellation.
- Race condition: simultaneous QR scans at same table — the DB unique constraint on `(table_id, status='open')` is the final guard.

### 5.3 WebSocket Broadcast After Commit

```python
# ✓ Correct pattern
async with db.begin():
    # ... all DB operations
    await db.commit()

# Only after commit succeeds:
await websocket_manager.broadcast(channel, event)
```

---

## 6. WebSocket Implementation

### 6.1 Connection Management

```python
# websocket/manager.py
class ConnectionManager:
    # Maintain channels: Dict[str, Set[WebSocket]]
    # Channels: "orders:{session_id}", "staff", "kitchen", "cashier"
    
    async def connect(self, websocket: WebSocket, channel: str): ...
    async def disconnect(self, websocket: WebSocket, channel: str): ...
    async def broadcast(self, channel: str, event: dict): ...
```

### 6.2 Event Schema (Mandatory)

```python
# websocket/events.py
class WSEvent(BaseModel):
    event: str          # e.g., "ORDER_STATUS_UPDATED"
    payload: dict
    timestamp: str      # ISO 8601 UTC

# Valid event names by channel:
CUSTOMER_EVENTS = ["ORDER_UPDATED", "ITEM_STATUS_CHANGED", "MENU_ITEM_DISABLED", "SESSION_CLOSED"]
STAFF_EVENTS = ["NEW_ORDER", "PAYMENT_REQUESTED", "OUT_OF_STOCK", "CANCEL_REQUEST_PENDING", "TABLE_TRANSFERRED"]
KITCHEN_EVENTS = ["NEW_ORDER_CONFIRMED", "CANCEL_REQUEST", "BUSY_MODE_CHANGED"]
CASHIER_EVENTS = ["PAYMENT_REQUESTED", "SPLIT_BILL_UPDATED"]
```

### 6.3 Multi-Instance Broadcast (Redis Pub/Sub)

- When running > 1 backend instance, all WebSocket broadcasts MUST go through Redis Pub/Sub.
- Publish to Redis → subscriber on each instance → broadcast to local WS connections.
- Never assume a single instance owns all WebSocket connections.

### 6.4 WebSocket Authentication

```python
@app.websocket("/ws/orders/{session_id}")
async def ws_customer(websocket: WebSocket, session_id: int):
    session = await validate_session(session_id)     # Must be 'open'
    if not session:
        await websocket.close(code=4001)             # Auth failure
        return
    ...

@app.websocket("/ws/staff")
async def ws_staff(websocket: WebSocket, token: str = Query(...)):
    user = await verify_jwt(token)                   # JWT in query param for WS
    if not user or user.role not in ["staff", "manager", "admin"]:
        await websocket.close(code=4001)
        return
```

---

## 7. Rate Limiting

```python
# Rate limiting keyed on session_id for customer endpoints
POST /api/orders: max 10 requests/minute/session_id

# Implement via Redis sliding window or token bucket
# Return 429 Too Many Requests with Retry-After header
```

---

## 8. Security Checklist (Non-Negotiable)

- [ ] All endpoints use HTTPS (enforce via middleware or reverse proxy)
- [ ] CORS: explicit allowlist — never `allow_origins=["*"]`
- [ ] JWT secret in environment variable, never in code
- [ ] Passwords hashed with bcrypt (cost ≥ 12) or Argon2id — never plain SHA/MD5
- [ ] All DB queries via SQLAlchemy ORM or parameterised queries — no raw string interpolation
- [ ] `audit_logs` table: DB user has INSERT only, no UPDATE/DELETE privileges
- [ ] Rate limit on `POST /api/orders`
- [ ] WebSocket auth validated before connection upgrade
- [ ] Secrets in environment variables, never hardcoded

---

## 9. Auto-Confirm Timeout Logic

- After order submission: start timer (background task or Celery) for 3 minutes.
- At 3 minutes: if `order.order_status = 'pending'`, send reminder to Staff via `/ws/staff`.
- At 5 minutes: escalate to Manager via `/ws/staff` (with manager flag).
- Auto-confirm: only executes if Admin has configured it (`admin_config.auto_confirm_enabled`). Do not auto-confirm by default.

---

## 10. Agent Behavior Guidance

### For GitHub Copilot
- Do not accept Copilot suggestions that add `discount` or `promo_code` fields to Order or OrderDetail.
- Always validate that generated service methods call `write_audit_log()` before accepting.
- When Copilot suggests inline state checks in route handlers — reject and move to `state_machine.py`.

### For Cursor
- Refactor only within module boundaries defined in Section 1.
- Do not merge services or routers. Keep `order_service.py` and `payment_service.py` separate.
- When editing state transitions, always update `state_machine.py` — not the individual service methods.

### For Claude Code / Continue
- Generate the `state_machine.py` module first, before any route handlers.
- Generate `audit_service.py` second — all service methods depend on it.
- Every generated route handler must be thin: validate input → call service → return response.

### For Antigravity / OpenHands
- Before generating any new API endpoint, verify it exists in ERS Section 7.
- Do not generate CRUD endpoints for entities not in Section 6 of ERS.
- Architecture decisions (e.g., adding a new service) require reading skill.md Section A first.

### For Windsurf / Roo Code
- Generated code for payment processing must enforce `cashier_id` linkage — do not allow null.
- Never generate a payment endpoint accessible by Staff role.
