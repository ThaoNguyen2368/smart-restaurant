# Smart Restaurant OS — Skill Layer (Domain Intelligence for AI Agents)

> **Classification:** AI Governance Document  
> **Source:** ERS v2.0 — Smart Restaurant OS  
> **Authority:** This file is the primary domain reference. All agents MUST read this file before writing any code.  
> **Conflict Resolution:** Requirements in this file override agent assumptions. No exceptions.

---

## A. System Overview

### What Is SR-OS?

Smart Restaurant OS (SR-OS) is an **Integrated Restaurant Ordering & Kitchen Management System (iROKMS)**. It is NOT a standalone POS. Its core function is to digitise the entire guest lifecycle: from table scan → ordering → kitchen execution → payment → table reset. The system follows a **"Paperless Restaurant"** model.

### Business Objectives

| Objective | Metric | Target |
|---|---|---|
| Service speed | Order submission → kitchen confirmation | < 3 minutes |
| Order error rate | Disputed orders | Reduce ≥ 70% |
| Revenue leakage | Cancellations without audit log | 0% |
| Table turnover | Full dine-in session processing | Reduce ≥ 15% |

### Architecture Direction

- **Backend:** FastAPI (Python 3.11+) — async, WebSocket-native
- **Frontend:** React.js + TypeScript — type-safe, real-time state
- **Database:** PostgreSQL 15+ — ACID, NOT SQLite (SQLite is forbidden in any environment except unit tests)
- **Real-time:** WebSocket channels per actor type; Redis Pub/Sub for multi-instance broadcast
- **Auth:** JWT (access: 15 min, refresh: 8 hours) + RBAC
- **Caching:** Redis for menu and session state
- **Deployment:** Docker + Docker Compose

### Core Modules

| Module | Users | Purpose |
|---|---|---|
| `customer-web` | Guests | QR scan, menu browse, cart, order, payment request |
| `staff-web` | Waiters | Table map, order queue, confirm/reject, table transfer |
| `cashier-web` | Cashiers | Invoice, payment recording, split bill, session close |
| `kds` | Kitchen staff | Cooking queue, status update, out-of-stock, busy mode |
| `admin-portal` | Admin / Manager | Menu CRUD, staff management, reports, audit log |
| `auth-service` | All staff | JWT issue/refresh, RBAC |
| `realtime-core` | Internal | WebSocket hub, Redis Pub/Sub broker |

---

## B. Domain Knowledge

### Restaurant Operations Context

SR-OS targets Vietnamese dine-in restaurant operations. Guests arrive at a physical table, scan a QR code, and interact via their own mobile browsers — no app install required. Staff use dedicated web portals. All communication between modules is real-time via WebSocket.

**Key operational constraints:**
- A table always belongs to at most one active session at any time.
- Guests cannot see or interact with other tables' sessions.
- The order creator (Staff) and payment processor (Cashier) MUST be different accounts (Segregation of Duties).
- All monetary values are in VND with 2 decimal places.

### Order Lifecycle

```
Customer submits order
  → Order created (status: pending)
    → Staff confirms (status: confirmed)
      → KDS receives, kitchen cooks (cooking_status: cooking)
        → Kitchen marks done (cooking_status: done)
          → Staff delivers to table (cooking_status: served)
            → [All items served → Customer requests payment]
```

Each re-order creates a new Order record within the same Session. A Session can contain multiple Orders.

### Session Lifecycle

```
QR Scanned → open → waiting_payment → closed → [new Session created on reset]
                  ↘ merged (absorbed into another session by Manager)
```

Session rules:
- Only one `open` Session per table at any time (BR-001).
- Session closes only after ALL payments (including split payments) are `completed`.
- Session reset creates a new Session — it does not reuse the previous record.

### Reservation Lifecycle

Reservations are **OUT OF SCOPE** for v2.0. Do not implement. Do not scaffold placeholder code. Mark as future roadmap.

### Payment Lifecycle

```
pending → completed (Cashier confirms payment)
completed → refunded (Admin action only)
```

- Payment is a separate entity (table: `payments`) — not a boolean flag on orders.
- A session can have multiple Payment records (split bill).
- Session status → `closed` only when SUM(payments.amount WHERE status='completed') >= session total.
- Cashier MUST be the actor on every payment record. Staff cannot process payments.

### Kitchen Workflow

1. KDS receives confirmed orders (broadcast by backend after Staff confirms).
2. KDS displays FIFO queue by confirmation time.
3. Kitchen updates `cooking_status` per order detail: `confirmed → cooking → done`.
4. Staff marks `done → served` after table delivery.
5. Kitchen can report out-of-stock — triggers immediate `is_available = FALSE` on the menu item and a WebSocket broadcast to all customer sessions.
6. Kitchen Busy Mode pauses new order confirmations and notifies Staff.

### Promotion Logic

Promotions / Vouchers / Loyalty are **OUT OF SCOPE** for v2.0. Do not implement. Do not add discount fields to any entity. Mark as future roadmap.

### Inventory Interactions

Detailed inventory management is **OUT OF SCOPE** for v2.0. The only inventory-adjacent feature is the kitchen out-of-stock report which sets `menu_items.is_available = FALSE`. No stock count, no ingredient tracking.

---

## C. Core Entities

### StaffUser

```
id, username (UNIQUE), password_hash, role, is_active, display_name
role ∈ {staff, cashier, manager, admin, kitchen}
```
- `is_active = FALSE` = soft delete. Never hard delete staff accounts.
- `display_name` appears in all audit log entries.
- Password: bcrypt cost ≥ 12 or Argon2id.

### Table

```
id, table_number (UNIQUE), qr_code_url, status, floor
status ∈ {empty, occupied, waiting_payment}
```
- `floor` is nullable, reserved for future multi-floor support.
- QR URL encodes `table_number`. On scan, backend resolves to table → session.

### Session

```
id, table_id (FK), opened_at, closed_at, status, merged_into_session_id (FK, nullable)
status ∈ {open, waiting_payment, closed, merged}
```
- `closed_at` is NULL while session is active.
- `merged_into_session_id` points to the master session when this session is absorbed.

### Order

```
id, session_id (FK), subtotal, tax_amount, service_charge, total_price, order_status, created_at
order_status ∈ {pending, confirmed, completed, cancelled}
```
- `subtotal + tax_amount + service_charge = total_price` — always server-calculated.
- Tax rates are snapshotted from active `tax_config` at order creation time.
- Client-provided totals are NEVER trusted.

### OrderDetail

```
id, order_id (FK), item_id (FK), quantity, unit_price, note, cooking_status, cancel_reason, cancelled_by (FK), cancelled_at
cooking_status ∈ {pending, confirmed, cooking, done, served, cancelled}
```
- `unit_price` = price snapshot at time of order. Immutable after creation.
- `cancel_reason` MANDATORY when cancelled from `cooking` status.
- `cancelled_by` = staff_user.id of the actor who executed the cancellation.

### MenuItem

```
id, category_id (FK), name, description, price, image_url, is_available, display_order
```
- `price` = current price (changes over time).
- `is_available = FALSE` hides the item on all customer sessions in real-time.
- Image served via CDN.

### Category

```
id, name (UNIQUE), display_order
```

### Payment

```
id, session_id (FK), cashier_id (FK → staff_users), amount, payment_method, transaction_ref, paid_at, split_label, status
payment_method ∈ {cash, card, transfer, voucher}
status ∈ {completed, refunded}
```
- `split_label` is used in split bill scenarios (e.g., "Guest 1", "Guest 2").
- Refund requires Admin action and must generate an audit log entry.

### TaxConfig

```
id, vat_rate, service_charge_rate, effective_from, created_by (FK → staff_users)
```
- The active config is the record with the latest `effective_from ≤ NOW()`.
- Multiple configs can exist — historical record is immutable.

### AuditLog

```
id, actor_id (FK → staff_users, nullable), actor_type, action, entity_type, entity_id, before_state (JSON), after_state (JSON), reason, created_at
actor_type ∈ {customer, staff, cashier, manager, admin, system}
action ∈ {cancel_item, approve_cancel, confirm_order, process_payment, transfer_table, merge_session, ...}
entity_type ∈ {order_detail, order, session, payment}
```
- **INSERT-only.** Never UPDATE or DELETE audit log records. Enforce at DB privilege level.
- `before_state` and `after_state` are JSON snapshots.
- `reason` is mandatory for cancellations from `cooking`.

---

## D. Mandatory Business Rules

These rules are non-negotiable. Violations are system defects, not edge cases.

| Rule ID | Rule | Enforcement |
|---|---|---|
| **BR-001** | A table can have at most one `open` Session at any time | DB constraint + service check before Session creation |
| **BR-002** | When an OrderDetail is cancelled, the Order `total_price` MUST be recalculated and synced to Customer Web in real-time | Server-side recalculation + WebSocket broadcast post-transaction |
| **BR-003** | Cancelling an item in `cooking` requires: (1) kitchen confirmation, (2) Manager approval, (3) `cancel_reason` in AuditLog — missing any one → REJECT | Three-step approval gate in service layer |
| **BR-004** | `unit_price` in OrderDetail is snapshotted at order creation — immutable. Never recalculate from current `menu_items.price` | Immutable field; set on creation, never updated |
| **BR-005** | Order totals (subtotal, tax_amount, service_charge, total_price) are always server-calculated. Never trust client-provided values | Ignore and recalculate on every write path |
| **BR-006** | Payment processor (Cashier) ≠ Order creator (Staff). Segregation of Duties. | RBAC: Cashier role cannot confirm orders; Staff role cannot process payments |
| **BR-007** | AuditLog is INSERT-only. No UPDATE or DELETE. | DB privilege revocation for UPDATE/DELETE on audit_logs |
| **BR-008** | Items in `done` or `served` status CANNOT be cancelled by any actor | State machine validation — terminal state |
| **BR-009** | `is_available = FALSE` on a MenuItem must be broadcast to ALL open Customer Web sessions immediately | WebSocket broadcast after DB update, same request cycle |
| **BR-010** | Session closes only when all split payments are `completed` | Payment completion check before `PATCH /sessions/{id}/close` |
| **BR-011** | Table transfer is blocked if destination table is `occupied` | Pre-check table status before transfer |
| **BR-012** | Passwords MUST use bcrypt (cost ≥ 12) or Argon2id | Password hashing service — enforce on create/update |
| **BR-013** | JWT access token: 15 min. Refresh token: 8 hours (one shift) | Token issuance configuration |
| **BR-014** | All timestamps stored in UTC. Display uses restaurant-configured timezone | UTC storage, timezone conversion at display layer |
| **BR-015** | Rate limit: POST /api/orders — max 10 requests/minute/session | Rate limiter middleware keyed on session_id |

---

## E. Coding Constraints

These are standing constraints for every agent working on this codebase:

1. **No terminology drift.** Use exact domain terms: `cooking_status`, `session`, `order_detail`, `split_label`, etc. Never rename to generic terms like `status`, `item`, `record`.

2. **No state transition bypasses.** All state changes (Session, OrderDetail, Table) MUST go through the centralised state transition validator. Do not inline status checks in route handlers.

3. **No inline business logic in routes.** Route handlers call services. Services contain domain logic. Routes handle HTTP concerns only.

4. **Audit-first.** Every mutating operation on Order, Session, Payment, or OrderDetail MUST write to `audit_logs` within the same database transaction.

5. **Server-side calculation always.** Never trust client-provided prices, totals, or tax amounts. Recalculate on the server on every order write.

6. **WebSocket events after commit.** Broadcast WebSocket events only AFTER the DB transaction commits successfully. Never broadcast optimistically before commit.

7. **No future-scope code.** Do not add reservation, delivery, loyalty, inventory, or multi-branch code. Do not scaffold these features. Stub with `# TODO: v3.0 roadmap` if referencing them in comments.

8. **Soft delete only.** Never hard-delete `staff_users`, `menu_items`, `categories`, or `sessions`. Use `is_active = FALSE` or status = `closed/cancelled`.

9. **SQLite forbidden in non-test environments.** PostgreSQL 15+ only for all environments except isolated unit tests.

10. **CORS whitelist, not wildcard.** Never set `allow_origins = ["*"]`. Always enumerate allowed domains.

---

## F. Engineering Priorities (in order)

1. **Domain Integrity** — Business rules enforced without exception.
2. **Audit Completeness** — Every state change is traceable.
3. **Security** — Auth, RBAC, rate limiting, HTTPS enforced everywhere.
4. **Consistency** — All modules use the same state machine definitions.
5. **Maintainability** — Modular services, clear separation of concerns.
6. **Performance** — Meet NFR targets (p95 < 300ms API, < 500ms WS).
7. **Scalability** — Stateless backend, Redis Pub/Sub for WS distribution.
8. **Error Prevention** — Validate inputs, enforce state machines, handle edge cases explicitly.

---

## G. WebSocket Channel Reference

| Channel | Subscribers | Published Events |
|---|---|---|
| `/ws/orders/{session_id}` | Customer Web | `ORDER_UPDATED`, `ITEM_STATUS_CHANGED`, `MENU_ITEM_DISABLED`, `SESSION_CLOSED` |
| `/ws/staff` | Staff Web | `NEW_ORDER`, `PAYMENT_REQUESTED`, `OUT_OF_STOCK`, `CANCEL_REQUEST_PENDING`, `TABLE_TRANSFERRED` |
| `/ws/kitchen` | KDS | `NEW_ORDER_CONFIRMED`, `CANCEL_REQUEST`, `BUSY_MODE_CHANGED` |
| `/ws/cashier` | Cashier Web | `PAYMENT_REQUESTED`, `SPLIT_BILL_UPDATED` |

**Event schema (mandatory):**
```json
{
  "event": "ORDER_STATUS_UPDATED",
  "payload": { "order_detail_id": 42, "new_status": "cooking" },
  "timestamp": "2025-01-01T10:00:00Z"
}
```

---

## H. API Response Conventions

- All timestamps: ISO 8601 UTC (`2025-01-01T10:00:00Z`)
- All monetary values: `REAL` with 2 decimal places, VND assumed unless configured
- Error responses must include business rule code:
```json
{
  "error": "BUSINESS_RULE_VIOLATION",
  "message": "Cannot cancel item in cooking status without Manager approval.",
  "code": "BR-003"
}
```
- Pagination for audit logs and order history: cursor-based (not offset-based)

---

*— END OF SKILL.MD —*
