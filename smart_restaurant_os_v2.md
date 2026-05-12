# Smart Restaurant OS — Enterprise Requirements Specification (ERS) v2.0

> **Classification:** CONFIDENTIAL
> **Document Type:** Integrated BRD + SRS (Business Requirements Document + System Requirements Specification)
> **Version:** 2.0 — Enterprise Grade
> **Release Year:** 2025
> **Status:** FINAL — Ready for stakeholder sign-off
> **Owner:** Product Owner / Solution Architect

| Field | Value |
|---|---|
| System Name | Smart Restaurant OS (SR-OS) |
| Document Version | 2.0 — Enterprise Grade |
| Document Type | BRD + SRS |
| Owner | Product Owner / Solution Architect |
| Status | FINAL |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Stakeholders & System Actors](#2-stakeholders--system-actors)
3. [Business Rules](#3-business-rules)
4. [Core Workflows](#4-core-workflows)
5. [Functional Requirements](#5-functional-requirements)
6. [Database Schema v2.0](#6-database-schema-v20)
7. [API Endpoints](#7-api-endpoints)
8. [Tech Stack](#8-tech-stack)
9. [Non-Functional Requirements](#9-non-functional-requirements)
10. [Error Handling & Edge Cases](#10-error-handling--edge-cases)
11. [Change Log v1.0 → v2.0](#11-change-log-v10--v20)
12. [Document Quality Assessment](#12-document-quality-assessment)
13. [System Modules Overview](#13-system-modules-overview) *(AI-enhanced)*
14. [Core Entities & Relationships](#14-core-entities--relationships) *(AI-enhanced)*
15. [State Machines](#15-state-machines) *(AI-enhanced)*
16. [Developer Notes & Implementation Hints](#16-developer-notes--implementation-hints) *(AI-enhanced)*

---

# 1. Executive Summary

## 1.1 Product Vision & Positioning

Smart Restaurant OS (SR-OS) is a next-generation restaurant operations platform, designed on the **"Paperless Restaurant"** model — digitising the entire data flow from when a guest enters to when they pay and leave.

SR-OS is **not a standalone POS**. It is an **Integrated Restaurant Ordering & Kitchen Management System (iROKMS)** combining:

- Table-side self-service (Customer QR ordering)
- Smart kitchen management (KDS — Kitchen Display System)
- Real-time revenue control

## 1.2 Business Objectives (KPIs)

| Objective | Metric | Target |
|---|---|---|
| Service speed | Time from order submission → kitchen confirmation | < 3 minutes |
| Order errors | Rate of disputed orders | Reduce ≥ 70% |
| Staff movement | Number of manual order trips | Reduce ≥ 70% |
| Revenue leakage | Cancellations without audit log | 0% |
| Table turnover | Time to process one full dine-in session | Reduce ≥ 15% |

## 1.3 Scope — v1.0 MVP

**In-scope:** Dine-in model only.
**Out-of-scope for MVP (designed for future extension):** Delivery, takeaway, reservation, multi-branch.

| Feature | In Scope v1.0 | Notes |
|---|---|---|
| Dine-in ordering (QR) | YES | |
| Kitchen Display System (KDS) | YES | |
| Staff / Admin portal | YES | |
| Internal payment recording | YES | No payment gateway integration |
| Basic revenue reports | YES | Admin only |
| Cancellation audit log | YES | **Mandatory** |
| Payment gateway (VNPay, MoMo) | NO | v2.0 |
| Reservation / table booking | NO | v2.0 |
| Delivery / takeaway | NO | v2.0 |
| Multi-branch / franchise | NO | v2.0 |
| Loyalty / voucher | NO | v2.0 |
| Detailed inventory management | NO | v2.0 |

---

# 2. Stakeholders & System Actors

## 2.1 Stakeholders

| Role | Description | Primary Concerns |
|---|---|---|
| Restaurant Owner / Investor | Business investor and owner | Revenue, operating costs, ROI |
| Manager / Admin | Day-to-day operations management | Reports, staff control, menu |
| Staff (Waiter) | Handles orders and table service | Processing speed, clear notifications |
| Head Chef / KDS Operator | Manages cooking queue | Priority order, stock-outs |
| Customer | End user at the table | Self-service ordering, status tracking |
| IT / Developer | System deployment and operations | Clear API, full documentation |

## 2.2 System Actors & Permissions

> **v2.0 Change:** Added Cashier role (separated from Staff), added Kitchen Busy Mode, clarified cancellation permissions.

| Actor | Access Method | Special Permissions | Restrictions |
|---|---|---|---|
| Customer | No login — authenticated via Session ID from QR | Order items, track order, request payment | Cannot cancel items being cooked; cannot see other tables' orders |
| Kitchen Staff | Login with KDS account at kitchen terminal | Update cooking status, report out-of-stock, activate Kitchen Busy Mode | Cannot edit prices; cannot view reports |
| Staff (Waiter) | JWT — role: `staff` | Confirm orders, propose cancellations, serve tables | Cannot self-cancel items with status `cooking` — requires Manager approval |
| Cashier | JWT — role: `cashier` *(NEW)* | Process payments, issue invoices, end-of-shift reconciliation | Cannot edit menu or view consolidated reports |
| Manager | JWT — role: `manager` | Approve any cancellation at any status, view reports, manage Staff | Cannot delete audit logs |
| Admin | JWT — role: `admin` | Full system access | None |

> **Segregation of Duties Principle:** Order creator (Staff) ≠ Payment processor (Cashier). This is the minimum requirement for financial reconciliation and internal fraud prevention.

---

# 3. Business Rules

## 3.1 Session Lifecycle

Each Session represents one unique guest visit at a table. A Session is created when the guest scans the QR code and ends when payment is completed and Staff resets the table.

### Session State Machine

```
QR Scanned → open → waiting_payment → closed
                                         ↓
                                    (new open via reset)
```

| From State | To State | Trigger | Actor |
|---|---|---|---|
| *(new)* | `open` | Guest scans valid QR at empty table | System (auto) |
| `open` | `waiting_payment` | Guest submits payment request | Customer |
| `waiting_payment` | `closed` | Cashier confirms payment received | Cashier |
| `closed` | *(new `open`)* | Manager/Staff resets table | Staff / Manager |
| `open` | `merged` | Session is merged into another session | Manager |

> **BR-001:** A table can only have **at most one Session** in `open` status at any time. The system must enforce this constraint before creating a new Session.

## 3.2 Order & Order Detail Lifecycle

Within a Session, a customer can create multiple Orders (re-orders). Each Order contains multiple Order Details (individual items).

| Status | Description | Allowed Actions |
|---|---|---|
| `pending` | Customer submitted, Staff not yet confirmed | Staff confirm/reject; Customer cancel |
| `confirmed` | Staff approved, not yet sent to kitchen | Staff send to kitchen |
| `cooking` | Kitchen is preparing | Staff may propose cancel (requires Manager approval + reason) |
| `done` | Kitchen completed, awaiting service | Cannot cancel |
| `served` | Staff delivered to table *(NEW)* | Cannot cancel |
| `cancelled` | Terminal state, irreversible | View audit log only |

> **BR-002:** When an Order Detail is cancelled, the Order's `total_price` must be **automatically recalculated** and synced to the Customer Web in real-time.

> **BR-003:** Cancelling an item in `cooking` status **REQUIRES ALL THREE** of: (1) kitchen confirmation, (2) Manager approval, (3) `cancel_reason` recorded in Audit Log. Missing any one condition → system rejects the request.

## 3.3 Cancellation / Void Logic (Anti-Fraud)

> **v2.0 Change:** v1 had no audit mechanism. Audit Log is now mandatory to prevent staff collusion in cancelling items for personal consumption.

| Item Status | Who Can Propose Cancel | Who Can Approve | Audit Log |
|---|---|---|---|
| `pending` | Customer or Staff | Automatic | Record actor + timestamp |
| `confirmed` | Staff | Staff | Record actor + timestamp |
| `cooking` | Staff (propose only) | **Manager (mandatory)** | **Mandatory:** actor + reason + kitchen confirmation |
| `done` / `served` | **Not allowed** | N/A | N/A |

## 3.4 Out-of-Stock Rules (Real-time)

> **v2.0 Change:** v1 only notified Staff. Lacked an instant disable mechanism on Customer Web for other tables — causing orders that could not be fulfilled.

When the kitchen reports an ingredient for item X is out of stock:

1. System **immediately** sets `is_available = FALSE` for the corresponding `menu_item`.
2. Broadcast via WebSocket to **ALL** open Customer Web sessions: hide/disable item X.
3. Pending orders containing item X: Staff receives separate notification to handle each order.
4. Manager can reactivate the item when the ingredient is restocked.

---

# 4. Core Workflows

## 4.1 Happy Path — Dine-in

```
Customer scans QR
    → Session created (open)
        → Customer builds cart & submits Order
            → Staff confirms Order (pending → confirmed)
                → KDS receives order (confirmed → cooking)
                    → Kitchen marks item done (cooking → done)
                        → Staff serves item (done → served)
                            → Customer requests payment
                                → Session: waiting_payment
                                    → Cashier confirms payment
                                        → Session: closed | Table: empty
```

| Step | Actor | Action | System Result |
|---|---|---|---|
| 1 | Customer | Scan QR at table | Create new Session; return `session_id` + menu |
| 2 | Customer | Select items → Add to cart → Submit order | Create Order + Order Details; status = `pending` |
| 3 | Staff | Receive new order notification → Confirm | Order → `confirmed`; KDS receives order |
| 4 | Kitchen | Receive order on KDS → Start cooking | Order Detail → `cooking`; broadcast WebSocket |
| 5 | Kitchen | Complete each item | Order Detail → `done`; Staff notified |
| 6 | Staff | Deliver item to table → Mark "Served" | Order Detail → `served` |
| 7 | Customer | Request payment | Session → `waiting_payment`; Cashier notified |
| 8 | Cashier | Confirm payment | `payment_status = TRUE`; Session → `closed`; Table → `empty` |

> **Auto-confirm Mechanism:** To prevent bottlenecks at peak hours: if Staff does not confirm an order within **3 minutes** → reminder. After **5 minutes** → Manager escalation. Admin can configure "auto-confirm" by category or time window.

## 4.2 Out-of-Stock Workflow

| Step | Actor | Action |
|---|---|---|
| 1 | Kitchen | Detect out-of-stock → Tap "Out of item X" on KDS |
| 2 | System | Disable item X on all Customer Web sessions; notify Staff |
| 3 | Staff | Contact customers at tables with item X in `pending`/`confirmed` orders |
| 4a | Customer | Agree to substitute → Staff updates Order Detail to new item |
| 4b | Customer | Want to cancel → Staff cancels Order Detail; total auto-updated |
| 5 | System | Broadcast order update real-time to Customer Web |

## 4.3 Table Transfer Workflow

> **NEW — Not in v1:** Important edge case in real restaurant operations.

**Precondition:** Session A is open at Table 1; Table 5 is empty.

| Step | Action |
|---|---|
| 1. Staff action | Staff selects "Transfer Table" → selects destination (Table 5) |
| 2. System processing | Update `session.table_id = Table 5`; Table 1 → `empty`; Table 5 → `occupied` |
| 3. No impact | All Orders and Order Details in Session A remain unchanged |
| 4. Notification | Customer Web automatically reflects new table via WebSocket |

**Guard condition:** System must reject transfer if destination table is `occupied`.

## 4.4 Merge Sessions Workflow

> **NEW — Not in v1:** Handles two groups of guests joining tables who want a combined bill.

**Scenario:** Session A (Table 1) + Session B (Table 2) need to merge.

1. Manager selects Master Session and Merge-from Session.
2. All Orders from the Merge-from Session are re-assigned to the Master Session.
3. Merge-from Session is marked `merged` (new status); its table returns to `empty`.
4. Final invoice is calculated on the Master Session.

## 4.5 Split Bill Workflow

> **NEW — Not in v1:** Real-world need — friends want to pay for individual items.

Cashier creates a Split Bill from a Session:

1. Assign each Order Detail to each person (Guest 1, Guest 2, ...).
2. System calculates subtotal per group; applies VAT and service charge proportionally.
3. Each group pays separately; recorded in individual `Payments` records.
4. Session only closes when **ALL** split payments are `completed`.

---

# 5. Functional Requirements

## 5.1 Customer Web (Table-side Guest Interface)

| FR-ID | Requirement | Priority |
|---|---|---|
| FR-C01 | Scan QR → Identify table → Auto-create/restore Session | MUST |
| FR-C02 | Display Digital Menu by category; auto-hide out-of-stock items (`is_available=false`) | MUST |
| FR-C03 | Cart: add/remove/edit quantity, add free-text notes per item | MUST |
| FR-C04 | Order confirmation screen before submission | MUST |
| FR-C05 | Track order status real-time via WebSocket (fallback: polling every 10s) | MUST |
| FR-C06 | Re-order additional items within open session | MUST |
| FR-C07 | Request payment — display running total invoice | MUST |
| FR-C08 | Cancel item in `pending` status (no additional confirmation required) | MUST |
| FR-C09 | Display banner when WebSocket disconnected and polling fallback is active | SHOULD |
| FR-C10 | Display notification when item is cancelled due to out-of-stock | SHOULD |

## 5.2 Staff Web (Waiter Interface)

| FR-ID | Requirement | Priority |
|---|---|---|
| FR-S01 | Real-time table map: `empty` / `occupied` / `waiting_payment` status | MUST |
| FR-S02 | Receive notifications for new orders and payment requests (real-time) | MUST |
| FR-S03 | Confirm or reject new orders | MUST |
| FR-S04 | Cancel items in `pending` or `confirmed` status | MUST |
| FR-S05 | Propose cancellation for items in `cooking` status — requires Manager approval | MUST |
| FR-S06 | Mark item as served (Order Detail → `served`) | SHOULD |
| FR-S07 | Transfer table for open session | SHOULD |
| FR-S08 | Timeout reminder: if order not confirmed within 3 minutes | MUST |
| FR-S09 | Receive out-of-stock notification from kitchen | MUST |
| FR-S10 | View session history for the day per table | SHOULD |

## 5.3 Cashier Web (NEW)

> **v2.0 Change:** Payment functions separated from Staff to enforce Segregation of Duties.

| FR-ID | Requirement | Priority |
|---|---|---|
| FR-CA01 | Receive payment request notifications from customers (real-time) | MUST |
| FR-CA02 | View full invoice: all Order Details in Session, VAT, Service Charge | MUST |
| FR-CA03 | Record payment method (Cash / Card / Bank Transfer) | MUST |
| FR-CA04 | Process Split Bill: assign items per person, calculate individual subtotals | SHOULD |
| FR-CA05 | Confirm payment → close Session → reset table | MUST |
| FR-CA06 | Print or export invoice (PDF / thermal print) | SHOULD |
| FR-CA07 | View shift history and total revenue for the shift | SHOULD |

## 5.4 Kitchen Display System (KDS)

| FR-ID | Requirement | Priority |
|---|---|---|
| FR-K01 | Display cooking queue in FIFO order (by confirmation time) | MUST |
| FR-K02 | Update status: `pending` → `cooking` → `done` | MUST |
| FR-K03 | Highlight warnings: items waiting > 10 min (orange), > 15 min (red) | MUST |
| FR-K04 | Audio alert when new order is confirmed by Staff | MUST |
| FR-K05 | Report out-of-stock — triggers out-of-stock workflow | MUST |
| FR-K06 | Kitchen Busy Mode: KDS can pause accepting new orders — notifies Staff | SHOULD |
| FR-K07 | Filter display by category (e.g., show only Beverages) | COULD |

## 5.5 Admin / Manager Portal

| FR-ID | Requirement | Priority |
|---|---|---|
| FR-A01 | Menu management: CRUD items, categories, prices, availability status | MUST |
| FR-A02 | Staff account management: create/edit/deactivate, assign roles | MUST |
| FR-A03 | Approve cancellation requests for items in `cooking` status | MUST |
| FR-A04 | Merge tables (Merge Sessions) | SHOULD |
| FR-A05 | Configure VAT rate and Service Charge | MUST |
| FR-A06 | Revenue reports: daily / weekly / monthly | MUST |
| FR-A07 | Reports: best-selling items, average service speed | SHOULD |
| FR-A08 | View Audit Log: all cancellation, order edit, and table transfer actions | MUST |
| FR-A09 | Configure auto-confirm timeout and escalation timeout | SHOULD |
| FR-A10 | Table management: add/edit tables, regenerate QR codes | MUST |

---

# 6. Database Schema v2.0

> **v2.0 Changes:** Added `Payments` table (decoupled from `payment_status`), `Audit_Logs` table, `Tax_Config` table; added `served` status to Order Details; added `cashier` role to `Staff_Users`.

## 6.1 ERD Overview

```
Tables ──< Sessions ──< Orders ──< Order_Details >── Menu_Items >── Categories
                  │
                  └──< Payments (NEW)

Order_Details → Audit_Logs (NEW)
Staff_Users   → Audit_Logs (NEW)
Staff_Users   → Payments
Tax_Config    → Orders (applied at order creation)
```

## 6.2 Table: `tables`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `INTEGER PK` | `AUTOINCREMENT` | Table identifier |
| `table_number` | `INTEGER` | `UNIQUE NOT NULL` | Display table number |
| `qr_code_url` | `TEXT` | `NOT NULL` | QR code URL |
| `status` | `TEXT` | `DEFAULT 'empty'; CHECK IN ('empty','occupied','waiting_payment')` | Table status |
| `floor` | `TEXT` | `NULLABLE` | Floor / zone (for future extension) |

## 6.3 Table: `sessions`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `INTEGER PK` | `AUTOINCREMENT` | |
| `table_id` | `INTEGER FK` | `REFERENCES tables(id)` | |
| `opened_at` | `DATETIME` | `DEFAULT NOW()` | |
| `closed_at` | `DATETIME` | `NULLABLE` | NULL = session still open |
| `status` | `TEXT` | `DEFAULT 'open'; CHECK IN ('open','waiting_payment','closed','merged')` | `merged`: when absorbed into another session |
| `merged_into_session_id` | `INTEGER FK` | `NULLABLE; REFERENCES sessions(id)` | NEW: supports merge sessions |

## 6.4 Table: `orders`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `INTEGER PK` | `AUTOINCREMENT` | |
| `session_id` | `INTEGER FK` | `REFERENCES sessions(id)` | |
| `subtotal` | `REAL` | `NOT NULL DEFAULT 0` | NEW: pre-tax price |
| `tax_amount` | `REAL` | `NOT NULL DEFAULT 0` | NEW: tax calculated from `Tax_Config` |
| `service_charge` | `REAL` | `NOT NULL DEFAULT 0` | NEW: service fee |
| `total_price` | `REAL` | `NOT NULL DEFAULT 0` | `subtotal + tax_amount + service_charge` |
| `order_status` | `TEXT` | `DEFAULT 'pending'; CHECK IN ('pending','confirmed','completed','cancelled')` | Overall order status |
| `created_at` | `DATETIME` | `DEFAULT NOW()` | |

## 6.5 Table: `order_details`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `INTEGER PK` | `AUTOINCREMENT` | |
| `order_id` | `INTEGER FK` | `REFERENCES orders(id)` | |
| `item_id` | `INTEGER FK` | `REFERENCES menu_items(id)` | |
| `quantity` | `INTEGER` | `NOT NULL DEFAULT 1` | |
| `unit_price` | `REAL` | `NOT NULL` | NEW: price snapshot at time of order (accounting requirement) |
| `note` | `TEXT` | `NULLABLE` | Free-text note |
| `cooking_status` | `TEXT` | `DEFAULT 'pending'; CHECK IN ('pending','confirmed','cooking','done','served','cancelled')` | Added: `confirmed`, `served` |
| `cancel_reason` | `TEXT` | `NULLABLE` | **Mandatory** if cancelled from `cooking` |
| `cancelled_by` | `INTEGER FK` | `NULLABLE; REFERENCES staff_users(id)` | NEW: audit |
| `cancelled_at` | `DATETIME` | `NULLABLE` | NEW: audit |

> **Why `unit_price` snapshot:** If the item price changes after the customer has already ordered, the final invoice must reflect the price at the time of ordering, not the current price. This is a mandatory accounting requirement.

## 6.6 Table: `payments` (NEW)

> **v2.0 Change:** Payment separated into its own entity; supports multiple methods, split bill, and accounting reconciliation.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `INTEGER PK` | `AUTOINCREMENT` | |
| `session_id` | `INTEGER FK` | `REFERENCES sessions(id)` | |
| `cashier_id` | `INTEGER FK` | `REFERENCES staff_users(id)` | Person who processed payment |
| `amount` | `REAL` | `NOT NULL` | Amount paid in this transaction |
| `payment_method` | `TEXT` | `CHECK IN ('cash','card','transfer','voucher')` | Payment method |
| `transaction_ref` | `TEXT` | `NULLABLE` | Transaction reference (card/transfer) |
| `paid_at` | `DATETIME` | `DEFAULT NOW()` | |
| `split_label` | `TEXT` | `NULLABLE` | Label for split bill (e.g., "Guest 1") |
| `status` | `TEXT` | `DEFAULT 'completed'; CHECK IN ('completed','refunded')` | |

## 6.7 Table: `tax_config` (NEW)

| Column | Type | Description |
|---|---|---|
| `id` | `INTEGER PK` | |
| `vat_rate` | `REAL` | VAT rate (e.g., `0.08` = 8%) |
| `service_charge_rate` | `REAL` | Service charge rate (e.g., `0.05` = 5%) |
| `effective_from` | `DATE` | Date this config takes effect |
| `created_by` | `INTEGER FK` | Admin who created this record |

## 6.8 Table: `audit_logs` (NEW)

> **v2.0 Change:** This table resolves all internal fraud risk and financial compliance requirements.

| Column | Type | Description |
|---|---|---|
| `id` | `INTEGER PK` | |
| `actor_id` | `INTEGER FK` | `staff_users.id` (NULL if action from Customer) |
| `actor_type` | `TEXT` | `CHECK IN ('customer','staff','cashier','manager','admin','system')` |
| `action` | `TEXT` | `CHECK IN ('cancel_item','approve_cancel','confirm_order','process_payment','transfer_table','merge_session',...)` |
| `entity_type` | `TEXT` | `CHECK IN ('order_detail','order','session','payment')` |
| `entity_id` | `INTEGER` | ID of the affected entity |
| `before_state` | `TEXT` | JSON snapshot of state before action |
| `after_state` | `TEXT` | JSON snapshot of state after action |
| `reason` | `TEXT` | Reason (mandatory for cancellations from `cooking`) |
| `created_at` | `DATETIME` | `DEFAULT NOW()` |

> **Integrity Rule:** `audit_logs` must be **INSERT-only** — no `UPDATE` or `DELETE` permitted. Enforce via DB-level privileges.

## 6.9 Table: `staff_users`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `INTEGER PK` | `AUTOINCREMENT` | |
| `username` | `TEXT` | `UNIQUE NOT NULL` | |
| `password_hash` | `TEXT` | `NOT NULL` | bcrypt or Argon2 |
| `role` | `TEXT` | `DEFAULT 'staff'; CHECK IN ('staff','cashier','manager','admin','kitchen')` | Added: `cashier`, `kitchen`, `manager` |
| `is_active` | `BOOLEAN` | `DEFAULT TRUE` | Soft delete |
| `display_name` | `TEXT` | `NOT NULL` | NEW: Name shown in audit log |

## 6.10 Table: `menu_items`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `INTEGER PK` | `AUTOINCREMENT` | |
| `category_id` | `INTEGER FK` | `REFERENCES categories(id)` | |
| `name` | `TEXT` | `NOT NULL` | Item name |
| `description` | `TEXT` | `NULLABLE` | |
| `price` | `REAL` | `NOT NULL` | Current price (order records snapshot in `unit_price`) |
| `image_url` | `TEXT` | `NULLABLE` | |
| `is_available` | `BOOLEAN` | `DEFAULT TRUE` | Real-time availability flag |
| `display_order` | `INTEGER` | `DEFAULT 0` | Sort order within category |

## 6.11 Table: `categories`

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `INTEGER PK` | `AUTOINCREMENT` | |
| `name` | `TEXT` | `UNIQUE NOT NULL` | Category name |
| `display_order` | `INTEGER` | `DEFAULT 0` | Sort order |

---

# 7. API Endpoints

## 7.1 Customer API

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/tables/{table_number}/session` | Initialise or retrieve current session from QR | None |
| `GET` | `/api/menu` | Get full menu; returns only `is_available=true` items | None |
| `POST` | `/api/orders` | Create new order within session | Session ID header |
| `GET` | `/api/orders/{order_id}` | Get order status and details | Session ID |
| `PATCH` | `/api/order-details/{id}/cancel` | Cancel item in `pending` status (Customer) | Session ID |
| `POST` | `/api/sessions/{id}/payment-request` | Request payment | Session ID |
| `WS` | `/ws/orders/{session_id}` | WebSocket — receive real-time updates | Session ID |

## 7.2 Staff API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Login — receive JWT |
| `GET` | `/api/tables` | Table map and real-time status |
| `GET` | `/api/orders/pending` | List of orders awaiting confirmation |
| `PATCH` | `/api/orders/{id}/confirm` | Confirm order → send to kitchen |
| `PATCH` | `/api/orders/{id}/reject` | Reject order *(NEW)* |
| `PATCH` | `/api/order-details/{id}/cancel` | Cancel item (`pending`/`confirmed`) |
| `POST` | `/api/order-details/{id}/cancel-request` | NEW: Propose cancel for item being cooked |
| `PATCH` | `/api/sessions/{id}/transfer-table` | NEW: Transfer table |
| `WS` | `/ws/staff` | WebSocket — receive real-time notifications |

## 7.3 Cashier API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/sessions/{id}/invoice` | Get full invoice (subtotal, VAT, service charge, total) |
| `POST` | `/api/payments` | NEW: Record payment (method, amount, transaction_ref) |
| `POST` | `/api/sessions/{id}/split-bill` | NEW: Create split bill by person |
| `PATCH` | `/api/sessions/{id}/close` | Close session after full payment |
| `POST` | `/api/tables/{id}/reset` | Reset table to `empty` |

## 7.4 Kitchen API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/kitchen/queue` | List of items to prepare (FIFO) |
| `PATCH` | `/api/order-details/{id}/status` | Update status: `cooking` / `done` |
| `POST` | `/api/menu-items/{id}/out-of-stock` | Report out-of-stock |
| `POST` | `/api/kitchen/busy-mode` | NEW: Activate/deactivate Kitchen Busy Mode |
| `PATCH` | `/api/order-details/{id}/cancel-confirm` | NEW: Confirm or reject cancel proposal from Staff |
| `WS` | `/ws/kitchen` | WebSocket — receive new orders real-time |

## 7.5 Admin / Manager API

| Method | Path | Description | Required Role |
|---|---|---|---|
| `CRUD` | `/api/menu-items` | Manage menu items | Admin |
| `CRUD` | `/api/categories` | Manage categories | Admin |
| `CRUD` | `/api/staff-users` | Manage staff accounts | Admin |
| `GET/PUT` | `/api/tax-config` | Configure VAT and service charge | Admin |
| `POST` | `/api/sessions/merge` | Merge sessions (merge tables) | Manager+ |
| `PATCH` | `/api/order-details/{id}/approve-cancel` | Approve cancel for item being cooked | Manager+ |
| `GET` | `/api/reports/daily` | Daily revenue report | Manager+ |
| `GET` | `/api/reports/items` | Best-selling items report | Manager+ |
| `GET` | `/api/audit-logs` | View full system audit log | Admin |

---

# 8. Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Backend | FastAPI (Python 3.11+) | Async-native, built-in WebSocket, auto-generates OpenAPI docs |
| Frontend | React.js + TypeScript | Type safety, real-time state management |
| Database | PostgreSQL 15+ | ACID compliance, JSON support for audit logs, production-grade |
| Real-time | WebSocket (FastAPI native) | Instant state sync between all clients |
| Message Broker | Redis Pub/Sub (scale path) | **Required** when running multi-instance to broadcast WebSocket |
| Auth | JWT + Refresh Token | Stateless auth, role-based permissions |
| Caching | Redis | Cache menu, session state during peak hours |
| Container | Docker + Docker Compose | Easy deployment, consistent environments |

> **Database Note:** The original v1 specification used SQLite ("Postgres — zero-config for MVP"). This was incorrect. SQLite does not support concurrent writes and is not suitable for production. **PostgreSQL is the correct choice from the start.**

---

# 9. Non-Functional Requirements

## 9.1 Performance

| Metric | Requirement |
|---|---|
| API response time (p95) | < 300ms under normal conditions |
| WebSocket latency | < 500ms from kitchen update to Customer receipt |
| Peak concurrent WebSocket connections | Support 200 simultaneous connections / instance |
| Menu load time | < 1.5 seconds on 4G mobile |
| Database query (hot path) | < 50ms for order placement and status update queries |

## 9.2 Availability

| Metric | Requirement |
|---|---|
| Uptime SLA | 99.5% (during restaurant operating hours) |
| WebSocket fallback | Automatic HTTP polling when WS disconnects — max 10s delay |
| Graceful degradation | On server restart: client auto-reconnects and fully syncs state |
| Offline fallback (recommended v2) | Local on-premise server to operate when internet is down |

## 9.3 Security

| Requirement | Detail |
|---|---|
| JWT Security | Access token: 15 minutes; Refresh token: 8 hours (1 work shift) |
| Password hashing | bcrypt with cost factor ≥ 12, or Argon2id |
| HTTPS | **Mandatory** for all traffic (including internal) |
| Rate limiting | `POST /api/orders`: max 10 requests/minute/session — prevent spam orders |
| WebSocket auth | Session ID validated server-side before accepting WS connection |
| Audit log integrity | Audit Log: **INSERT-only** — `UPDATE` and `DELETE` not permitted |
| SQL Injection | All queries must use parameterised queries / ORM |
| CORS | Whitelist specific domains — do not use wildcard `*` |

## 9.4 Scalability

- **Horizontal scaling:** Add FastAPI instances; Redis Pub/Sub syncs WebSocket across instances.
- **Stateless backend:** All state resides in PostgreSQL or Redis — instances can restart at any time.
- **Database:** PostgreSQL connection pooling (PgBouncer) for peak hours.
- **CDN:** Static assets (menu images) served via CDN — reduces backend load.

## 9.5 Data Consistency

- All Order Detail state changes must be written inside a PostgreSQL transaction.
- WebSocket broadcast only occurs **AFTER** the transaction commits successfully.
- Order totals are recalculated server-side — client-provided totals are never trusted.
- All timestamps use UTC; display uses restaurant timezone (configured in Admin).

---

# 10. Error Handling & Edge Cases

| Scenario | Root Cause | Handling | SLA |
|---|---|---|---|
| Staff does not confirm order | Busy serving | Reminder after 3 min; Escalate to Manager after 5 min; Auto-confirm if configured | < 5 minutes |
| Item out of stock after order enters kitchen | Ingredient depleted | Kitchen reports → disable item immediately → Staff handles affected orders | Real-time |
| Cancel item being cooked | Customer change of mind / restaurant shortage | Manager must approve + kitchen confirms + `cancel_reason` required | Manual |
| WebSocket disconnected (Client) | Weak network | Polling fallback every 10s; notification banner; auto-reconnect | < 10s |
| WebSocket disconnected (Server multi-instance) | Scale-out | Redis Pub/Sub syncs across instances | Transparent |
| Multiple guests at same table ordering simultaneously | Race condition | Each submission is a separate Order within the Session; server processes sequentially | Atomic |
| Guest scans QR for table already occupied | Old QR not reset | Return existing Session if still `open`; reject if occupied by a different session | Instant |
| Table transfer to occupied destination | Operational error | System returns error — transfer to `occupied` table not permitted | Instant |
| Item price changed after order placed | Admin updated price | `unit_price` snapshot in Order Detail does not change | Transparent |
| Partial payment (split) fails | Connection error | Payment status = `pending`; Session does not close until total paid = total amount | Manual retry |

---

# 11. Change Log v1.0 → v2.0

| Item | Problem in v1 | Solution in v2 | Business Impact |
|---|---|---|---|
| Actor: Cashier | Missing — Staff doubled as cashier | Created separate Cashier role | Prevents fraud; clean financial reconciliation |
| Actor: Manager | Ambiguous with Admin | Separated Manager: operational permissions, no system permissions | Clear separation of duties |
| Payments table | `payment_status` was a boolean in Orders | Dedicated Payments table with method, amount, transaction_ref | Multi-method support, split bill, reconciliation |
| Audit Log | Completely absent | Mandatory `Audit_Logs` table with before/after state | Prevents fraud; financial compliance; debugging |
| Void Logic | Staff-only, no approval | Manager approval + kitchen confirmation + reason mandatory | Plugs internal fraud vulnerability |
| Out-of-stock | Only notified Staff | Immediately disables `is_available` + broadcasts to all Customer Web | Prevents accepting undeliverable orders |
| Tax & Service Charge | Not present | `Tax_Config`; separate subtotal/tax/service_charge/total fields | Correct accounting; legal compliance |
| Price snapshot | No `unit_price` in Order Detail | `unit_price` recorded at time of order | Invoice unchanged even if Admin later updates price |
| Table transfer | No workflow | `transfer-table` API + update `session.table_id` | Operational flexibility |
| Merge sessions | Not present | Merge Sessions: re-assign Orders + mark session `merged` | Handles groups joining tables |
| Split Bill | Not present | Split Bill by person; individual subtotals; separate Payments | High real-world demand |
| Kitchen Busy Mode | Not present | KDS can pause accepting orders + notifies Staff | Prevents kitchen overload at peak hours |
| `served` status | Not present | `cooking_status` adds `confirmed` and `served` | Full lifecycle tracking of each dish |
| Auto-confirm timeout | No clear timeout | Reminder at 3 min; Escalate Manager at 5 min; optional auto-confirm | Resolves peak hour bottleneck |
| SQLite vs PostgreSQL | Stated "Postgres — zero-config" (inaccurate) | PostgreSQL 15+ mandatory; SQLite for local test only | Production stability; concurrent writes |
| WebSocket multi-instance | Mentioned Redis but not clearly specified | Redis Pub/Sub mandatory when scaling; clearly documented | Real scalability |

---

# 12. Document Quality Assessment

## v1.0 vs v2.0 Comparison

| Criterion | v1.0 | v2.0 | Improvement |
|---|---|---|---|
| Domain completeness | 55% | 90% | +35% |
| Actor coverage | 3/6 roles | 6/6 roles | Cashier, Manager, Kitchen role clearly defined |
| Business rules documented | 4 rules | 15+ rules | Void logic, out-of-stock, SoD |
| Data model completeness | 7 tables | 10 tables | Payments, Audit_Logs, Tax_Config |
| Edge case coverage | 7 cases | 10+ cases | Table transfer, merge, split bill |
| Fraud prevention | None | Complete | Audit log, SoD, Manager approval |
| Financial accuracy | Incomplete | Complete | VAT, service charge, price snapshot |
| API coverage | 14 endpoints | 28+ endpoints | Cashier API, Manager API added |
| Stakeholder readability | Developer-only | Multi-audience | PO/Investor/Dev friendly |

## Backlog — Not in v2.0 (Future Roadmap)

- **Menu Item Modifiers/Options** (e.g., "Pho without onion", "add extra egg") — should be added before production launch for complex menus.
- **Detailed Inventory Management** (ingredients, stock levels) — needed for larger restaurants.
- **Reservation System** — advance table booking.
- **Loyalty Program / Voucher.**
- **Offline Mode with Local Edge Server** — critical for restaurants with unstable Wi-Fi.
- **Multi-branch support** — franchise chain.
- **Payment Gateway Integration** (VNPay, MoMo, Stripe).

---

# 13. System Modules Overview

> *(AI-enhanced section — added for coding agent orientation)*

The system consists of **6 client-facing modules** and **1 shared core infrastructure layer**.

| Module | Primary Users | Key Frontend Pages | Key Backend Services |
|---|---|---|---|
| `customer-web` | Guests at table | Menu, Cart, Order Status, Payment Request | Session, Order, WebSocket |
| `staff-web` | Waiters | Table Map, Order Queue, Notifications | Order Confirm, Table Transfer |
| `cashier-web` | Cashiers | Invoice, Payment Form, Split Bill, Shift History | Payment, Session Close |
| `kds` | Kitchen staff | Cooking Queue, Item Status, Out-of-Stock | Kitchen Queue, Busy Mode |
| `admin-portal` | Admin / Manager | Menu CRUD, Staff CRUD, Reports, Audit Log | All management APIs |
| `auth-service` | All staff roles | Login | JWT issue/refresh, RBAC |
| `realtime-core` | *(internal)* | — | WebSocket hub, Redis Pub/Sub |

---

# 14. Core Entities & Relationships

> *(AI-enhanced section — added for DB schema and ORM model generation)*

```
Table (1) ──────────────< Session (many)
Session (1) ────────────< Order (many)
Order (1) ──────────────< OrderDetail (many)
OrderDetail (many) >──── MenuItem (1)
MenuItem (many) >──────── Category (1)
Session (1) ────────────< Payment (many)
OrderDetail (1) ─────────< AuditLog (many)  [via entity_id]
StaffUser (1) ───────────< AuditLog (many)  [via actor_id]
StaffUser (1) ───────────< Payment (many)   [as cashier_id]
TaxConfig → applied at Order creation
```

### Recommended ORM Model Order (for dependency resolution)

1. `Category`
2. `MenuItem`
3. `StaffUser`
4. `TaxConfig`
5. `Table`
6. `Session`
7. `Order`
8. `OrderDetail`
9. `Payment`
10. `AuditLog`

---

# 15. State Machines

> *(AI-enhanced section — added for frontend state management and backend validation logic)*

## 15.1 Session States

```
[NEW] ──(QR scan)──> open
open ──(payment request)──> waiting_payment
waiting_payment ──(cashier confirms)──> closed
open ──(manager merges)──> merged
closed ──(staff reset)──> [NEW open session created]
```

## 15.2 Order Detail (cooking_status) States

```
[NEW] ──(order submitted)──> pending
pending ──(staff confirms)──> confirmed
confirmed ──(kitchen receives)──> cooking
cooking ──(kitchen done)──> done
done ──(staff delivers)──> served
pending  ──(customer/staff cancels)──> cancelled
confirmed ──(staff cancels)──> cancelled
cooking ──(manager approves + kitchen confirms)──> cancelled
```

**Terminal states:** `served`, `cancelled`
**No backward transitions permitted.**

## 15.3 Table Status States

```
empty ──(QR scan creates session)──> occupied
occupied ──(payment request sent)──> waiting_payment
waiting_payment ──(session closed + reset)──> empty
occupied ──(session transfer out)──> empty
empty ──(session transfer in)──> occupied
```

## 15.4 Payment Status

```
pending ──(cashier confirms)──> completed
completed ──(admin action)──> refunded
```

---

# 16. Developer Notes & Implementation Hints

> *(AI-enhanced section — added to accelerate backend and frontend development)*

## 16.1 Backend Architecture Recommendations

- Use **FastAPI dependency injection** to resolve `current_user` (JWT) and `current_session` (Session ID header) on every request.
- Implement a **state transition validator** as a reusable service — centralise all `cooking_status` and `session.status` transition logic. Do not inline state checks in route handlers.
- All WebSocket events should follow a typed event schema:
  ```json
  {
    "event": "ORDER_STATUS_UPDATED",
    "payload": { "order_detail_id": 42, "new_status": "cooking" },
    "timestamp": "2025-01-01T10:00:00Z"
  }
  ```
- **Audit Log writes** should be wrapped in the same transaction as the state change. Use a helper function `write_audit_log(session, actor, action, entity, before, after, reason)`.

## 16.2 WebSocket Channel Design

| Channel | Subscribers | Events Published |
|---|---|---|
| `/ws/orders/{session_id}` | Customer Web | `ORDER_UPDATED`, `ITEM_STATUS_CHANGED`, `MENU_ITEM_DISABLED`, `SESSION_CLOSED` |
| `/ws/staff` | Staff Web | `NEW_ORDER`, `PAYMENT_REQUESTED`, `OUT_OF_STOCK`, `CANCEL_REQUEST_PENDING`, `TABLE_TRANSFERRED` |
| `/ws/kitchen` | KDS | `NEW_ORDER_CONFIRMED`, `CANCEL_REQUEST`, `BUSY_MODE_CHANGED` |
| `/ws/cashier` | Cashier Web | `PAYMENT_REQUESTED`, `SPLIT_BILL_UPDATED` |

## 16.3 Business Logic Checklist for Order Creation (`POST /api/orders`)

1. Validate Session ID exists and status = `open`.
2. Validate all `item_id` values exist and `is_available = TRUE`.
3. Snapshot `unit_price` from current `menu_items.price` — do NOT trust client-sent price.
4. Look up active `Tax_Config` (latest `effective_from ≤ NOW()`).
5. Calculate `subtotal`, `tax_amount`, `service_charge`, `total_price` server-side.
6. Create Order + Order Details in a single transaction.
7. Write AuditLog entry.
8. Broadcast `NEW_ORDER` event to `/ws/staff`.
9. Start 3-minute confirm timeout timer.

## 16.4 Key API Response Conventions

- All timestamps: ISO 8601 UTC (`2025-01-01T10:00:00Z`).
- All monetary values: `REAL` with 2 decimal places; currency assumed VND unless configured.
- Error responses:
  ```json
  { "error": "BUSINESS_RULE_VIOLATION", "message": "Cannot cancel item in cooking status without Manager approval.", "code": "BR-003" }
  ```
- Pagination: use cursor-based for audit logs and order history.

## 16.5 Sprint Planning Suggestions

| Sprint | Focus | Key Deliverables |
|---|---|---|
| Sprint 1 | Core data model + Auth | DB schema, migrations, JWT auth, RBAC middleware |
| Sprint 2 | Customer flow (Happy Path) | QR session, menu API, order creation, WebSocket basic |
| Sprint 3 | Staff + Kitchen flow | Order confirm/reject, KDS queue, status updates |
| Sprint 4 | Cashier + Payments | Invoice API, payment recording, session close |
| Sprint 5 | Admin portal + Menu CRUD | Menu management, staff management, tax config |
| Sprint 6 | Advanced features | Table transfer, merge session, split bill, busy mode |
| Sprint 7 | Audit + Reports + Security | Audit log, revenue reports, rate limiting, HTTPS enforcement |
| Sprint 8 | Hardening | Edge cases, error handling, performance testing, docs |

---

*— END OF DOCUMENT —*

> **Document Version:** ERS v2.0 | **Converted:** Structured Engineering Requirements Markdown
> **Classification:** CONFIDENTIAL
