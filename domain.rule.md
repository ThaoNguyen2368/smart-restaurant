# domain.rule.md — Smart Restaurant OS
# Domain Boundary & Business Constraint Rules

> **Scope:** All agents working on any module of SR-OS  
> **Read order:** This file is read SECOND, after `skill.md`  
> **Authority:** No code may be written that violates a rule in this file

---

## 1. Domain Boundaries

### 1.1 In-Scope for v2.0 (IMPLEMENT THESE)

- Dine-in operations only
- Table-side self-service ordering via QR
- Kitchen Display System (KDS) workflow
- Staff order management (confirm, reject, serve, transfer table)
- Cashier payment processing (single, split bill)
- Admin/Manager portal (menu, staff, reports, audit)
- Session lifecycle management
- Real-time synchronisation via WebSocket

### 1.2 Out-of-Scope for v2.0 (DO NOT IMPLEMENT — HARD BOUNDARY)

| Feature | Action Required |
|---|---|
| Delivery / Takeaway | FORBIDDEN — do not add delivery_type fields, delivery_address, or courier logic |
| Reservation / Booking | FORBIDDEN — no reservation table, no booking flow |
| Loyalty / Voucher / Points | FORBIDDEN — no discount fields on Order unless it is a tax/service charge |
| Detailed Inventory Management | FORBIDDEN — no ingredient tables, no stock level tracking |
| Multi-Branch / Franchise | FORBIDDEN — no branch_id on any entity |
| Payment Gateway (VNPay, MoMo) | FORBIDDEN for v2 — payment_method field exists for future but gateway code is out of scope |
| Menu Item Modifiers/Options | FORBIDDEN — no modifier, addon, or variant tables for v2 |
| Offline Mode | FORBIDDEN — no local edge server logic |

> **Fail condition:** Agent adds any of the above. Code review must reject it. If in doubt, add a comment `# OUT OF SCOPE — v3.0 roadmap` and raise with team lead.

---

## 2. Entity Invariants

These invariants must hold at ALL times. Violations are system defects.

### Session Invariants

- `INV-S01`: A `tables` record may have at most one `sessions` record with `status = 'open'` at any time.
- `INV-S02`: A session with `status = 'closed'` or `status = 'merged'` is terminal — no further state transitions.
- `INV-S03`: `sessions.closed_at` is NULL while session is active. It is set exactly once, when the session transitions to `closed`.
- `INV-S04`: `merged_into_session_id` is NULL unless `status = 'merged'`.

### OrderDetail Invariants

- `INV-OD01`: `cooking_status` follows a strict DAG — no backward transitions permitted.
- `INV-OD02`: `served` and `cancelled` are terminal states — no further transitions.
- `INV-OD03`: `unit_price` is set at creation and NEVER modified. It is a financial record.
- `INV-OD04`: `cancel_reason` MUST be non-null when `cooking_status` transitions to `cancelled` from `cooking`.
- `INV-OD05`: `cancelled_by` MUST reference the staff_user who executed or approved the cancellation.

### Payment Invariants

- `INV-P01`: `payments.cashier_id` MUST reference a `staff_users` record with `role = 'cashier'`.
- `INV-P02`: A session does not close until the sum of all `completed` payments equals the session total.
- `INV-P03`: `refunded` is the only state `completed` can transition to, and requires Admin action.

### AuditLog Invariants

- `INV-AL01`: No UPDATE or DELETE ever executes against `audit_logs`. INSERT only.
- `INV-AL02`: Every mutating operation on `order_details`, `orders`, `sessions`, or `payments` produces exactly one AuditLog entry per operation.
- `INV-AL03`: `reason` field MUST be populated for all cancellation-related audit entries.

---

## 3. Required Business Invariants (State Transitions)

### 3.1 Valid Session Transitions

| From | To | Actor | Condition |
|---|---|---|---|
| *(new)* | `open` | System | QR scan at empty table |
| `open` | `waiting_payment` | Customer | Payment request submitted |
| `waiting_payment` | `closed` | Cashier | All payments completed |
| `open` | `merged` | Manager | Session merged into master |
| `closed` | *(new `open`)* | Staff/Manager | Table reset — creates NEW Session record |

**FORBIDDEN transitions:**
- `waiting_payment → open` (cannot un-request payment)
- `closed → open` (cannot re-open; must create new session via reset)
- `merged → any` (terminal)

### 3.2 Valid OrderDetail Transitions

| From | To | Actor | Condition |
|---|---|---|---|
| `pending` | `confirmed` | Staff | Standard confirmation |
| `pending` | `cancelled` | Customer or Staff | Auto-approved |
| `confirmed` | `cooking` | Kitchen | KDS receives order |
| `confirmed` | `cancelled` | Staff | Staff-only approval |
| `cooking` | `done` | Kitchen | Cooking complete |
| `cooking` | `cancelled` | Manager | Must have kitchen confirmation + reason |
| `done` | `served` | Staff | Item delivered to table |
| `done` | `cancelled` | NOBODY | FORBIDDEN |
| `served` | `cancelled` | NOBODY | FORBIDDEN |

### 3.3 Valid Table Transitions

| From | To | Trigger |
|---|---|---|
| `empty` | `occupied` | QR scan creates session |
| `occupied` | `waiting_payment` | Customer requests payment |
| `waiting_payment` | `empty` | Session closed + reset |
| `occupied` | `empty` | Session transferred OUT of this table |
| `empty` | `occupied` | Session transferred INTO this table |

---

## 4. Forbidden Actions (Hard Stops)

The following actions are architecturally prohibited. Any agent that generates code implementing these is producing a defect:

| Forbidden Action | Rule Reference | Consequence |
|---|---|---|
| Allow `payment_status` as boolean field on `orders` table | v2.0 schema — payments is a separate entity | Incorrect financial model |
| Trust client-submitted price or total for order creation | BR-005 | Revenue fraud vector |
| Allow cancellation of `done` or `served` items | BR-008 | Irreversible service state |
| Write to `audit_logs` with UPDATE or DELETE | BR-007 / INV-AL01 | Audit integrity compromise |
| Let Staff role process payments | BR-006 | Segregation of Duties violation |
| Allow two open sessions on the same table | BR-001 / INV-S01 | Double-ordering fraud vector |
| Hard-delete any staff_user, menu_item, or session | E. Coding Constraint #8 | Data loss, audit gaps |
| Broadcast WebSocket before DB transaction commits | E. Coding Constraint #6 | Phantom state propagation |
| Use SQLite in staging or production | E. Coding Constraint #9 | Write concurrency failure |
| Set CORS allow_origins = ["*"] | NFR Security | Security vulnerability |

---

## 5. Domain Terminology Lock

Agents MUST NOT rename or re-interpret these domain terms:

| Canonical Term | Forbidden Aliases |
|---|---|
| `session` | `visit`, `dineInSession`, `guestSession`, `tableVisit` |
| `order_detail` | `order_item`, `line_item`, `dish`, `cart_item` |
| `cooking_status` | `status`, `item_status`, `kitchen_status`, `dish_status` |
| `split_label` | `guest_label`, `person`, `payer`, `split_name` |
| `cancel_reason` | `reason`, `note`, `voiding_reason` |
| `unit_price` | `price`, `item_price`, `cost`, `snapshot_price` |
| `cashier` | `treasurer`, `teller`, `payment_staff` |
| `manager` | `supervisor`, `restaurant_manager`, `ops_lead` |

---

## 6. Edge Case Requirements

These edge cases MUST be handled. They are not optional:

| Edge Case | Required Handling |
|---|---|
| Guest scans QR for table already `occupied` | Return existing `open` session if belongs to same guest; reject if belongs to different session |
| Table transfer destination is `occupied` | Reject immediately with error — do not transfer |
| Item price changes after order placed | `unit_price` in `order_detail` stays unchanged |
| WebSocket disconnects on client | HTTP polling fallback every 10 seconds; reconnect on restore |
| Multiple guests submitting orders simultaneously | Server processes each submission atomically (DB transaction) |
| Partial split payment fails | Session remains `waiting_payment`; retry allowed; session does not close |
| Order not confirmed within 3 minutes | Staff reminder event; after 5 minutes: Manager escalation |
| Kitchen reports out-of-stock for item with pending orders | Disable item + Staff receives per-table notification |

---

## 7. Agent Behavior Guidance

### For All Agents
- **Before writing any domain logic:** Re-read this file and `skill.md`. Do not rely on memory.
- **When in conflict:** Requirements > agent assumptions. Stop and raise the conflict.
- **When something is unclear:** Default to the most restrictive interpretation (favour data safety).

### For GitHub Copilot
- Copilot suggestions for business logic MUST be validated against this file before acceptance.
- Auto-complete on `cooking_status` transitions: verify against Section 3.2 before accepting.
- Never accept Copilot suggestions that add out-of-scope entities (delivery, reservation, loyalty).

### For Cursor
- When refactoring, verify every state check still uses the centralised validator — do not inline.
- Cursor AI "explain" feature may describe generic patterns — always reconcile with domain rules here.
- Module boundary moves require explicit team approval. Cursor must not auto-reorganise service boundaries.

### For Windsurf / OpenHands
- Agent-driven file generation must pass through domain rule checklist before commit.
- Generated migration files must be reviewed against Section 2 invariants before applying.

### For Claude Code / Continue
- Use this file as the final authority when generating service-layer logic.
- Always check: does the generated code respect all INV-* invariants and BR-* rules?

### For Antigravity / Roo Code
- Domain correctness over development speed. A slow correct implementation is better than fast incorrect code.
- Architecture decisions (new services, new tables, new APIs) must align with skill.md Section A before proceeding.
