# testing.rule.md — Smart Restaurant OS
# Testing Engineering Rules

> **Framework:** pytest (backend) · Vitest / Jest + React Testing Library (frontend)  
> **Read after:** `skill.md` → `domain.rule.md` → this file  
> **Philosophy:** Business rule tests are non-negotiable. Domain correctness > code coverage %.

---

## 1. Testing Pyramid

```
             ┌─────────┐
             │   E2E   │  ← Playwright (critical paths only)
           ┌─┴─────────┴─┐
           │  Integration │  ← API + DB (PostgreSQL in Docker)
         ┌─┴─────────────┴─┐
         │   Business Rules │  ← State machine + service layer (mandatory, highest priority)
       ┌─┴─────────────────┴─┐
       │     Unit Tests       │  ← Pure functions, calculations, validators
     └──────────────────────────┘
```

---

## 2. Mandatory Test Coverage Areas

These are **non-negotiable.** Every item must have tests before the feature is considered done.

### 2.1 Business Rule Tests (Priority 1 — Must Ship With Feature)

| Rule | Required Test Cases |
|---|---|
| BR-001: One open session per table | Attempt second QR scan on occupied table — expect session returned, not created |
| BR-002: Total recalculation on cancel | Cancel OrderDetail → verify Order.total_price updated, WS event emitted |
| BR-003: Cooking cancel requires 3 conditions | Cancel cooking item without manager approval → expect 403 with BR-003 code |
| BR-003 | Cancel cooking item without kitchen confirmation → expect rejection |
| BR-003 | Cancel cooking item without cancel_reason → expect rejection |
| BR-003 | All 3 conditions met → expect cancellation succeeds + audit log written |
| BR-004: unit_price immutable | Update menu_item.price → verify existing order_detail.unit_price unchanged |
| BR-005: Server-side pricing | Submit order with fake prices → verify server recalculates from menu_items |
| BR-006: Cashier SoD | Staff role calls POST /api/payments → expect 403 |
| BR-006 | Cashier role calls PATCH /api/orders/{id}/confirm → expect 403 |
| BR-007: AuditLog INSERT-only | Attempt UPDATE on audit_logs → expect DB error (permission denied) |
| BR-008: Terminal state no cancel | Cancel item in 'done' status → expect rejection |
| BR-008 | Cancel item in 'served' status → expect rejection |
| BR-009: Out-of-stock broadcast | Kitchen reports out-of-stock → verify WS broadcast emitted |
| BR-010: Session close only when paid | Attempt session close with incomplete payment → expect rejection |
| BR-011: Transfer to occupied table | Transfer table to occupied destination → expect rejection |

### 2.2 State Machine Tests (Priority 1)

Test every valid and invalid transition for all three state machines:

**Session state machine:**
```python
# Test valid transitions
test_session_open_to_waiting_payment()
test_session_waiting_payment_to_closed()
test_session_open_to_merged()

# Test forbidden transitions
test_session_waiting_payment_cannot_revert_to_open()
test_session_closed_cannot_transition()
test_session_merged_cannot_transition()
```

**OrderDetail state machine:**
```python
# Valid
test_detail_pending_to_confirmed_by_staff()
test_detail_confirmed_to_cooking_by_kitchen()
test_detail_cooking_to_done_by_kitchen()
test_detail_done_to_served_by_staff()
test_detail_pending_to_cancelled_by_customer()
test_detail_confirmed_to_cancelled_by_staff()
test_detail_cooking_to_cancelled_with_manager_approval()

# Invalid (must return 409 or 403)
test_detail_cannot_revert_cooking_to_confirmed()
test_detail_done_cannot_be_cancelled()
test_detail_served_cannot_be_cancelled()
test_detail_served_cannot_transition_to_anything()
```

### 2.3 API Integration Tests (Priority 2)

All critical API endpoints require integration tests with a real PostgreSQL instance (Docker):

```python
# Order creation flow
test_post_orders_creates_correct_snapshot()
test_post_orders_rejects_unavailable_items()
test_post_orders_calculates_tax_from_active_config()
test_post_orders_rate_limit_10_per_minute()

# Payment flow
test_post_payments_requires_cashier_role()
test_session_close_requires_full_payment()
test_split_bill_closes_session_only_when_all_paid()

# Table operations
test_table_transfer_rejects_occupied_destination()
test_session_merge_reassigns_orders_to_master()
```

### 2.4 Edge Case Tests (Priority 2)

| Scenario | Test |
|---|---|
| Simultaneous QR scans same table | Race condition test — only one session created |
| Price change after order placed | Verify unit_price in order_detail unchanged |
| WebSocket disconnection fallback | Mock WS drop → verify polling starts within 10s |
| Partial split payment failure | Simulate connection error → session stays waiting_payment |
| Order confirm timeout | Mock 3 min elapsed → verify reminder event emitted |
| Out-of-stock during active order | Kitchen reports OOS → verify pending orders for that item get Staff notification |

---

## 3. Audit Log Tests (Mandatory)

Every state-mutating operation must be verified to produce an audit log entry:

```python
def test_cancel_pending_item_writes_audit_log():
    # Create order detail with status 'pending'
    # Cancel via Customer API
    # Assert: audit_logs has 1 entry with action='cancel_item', correct before/after states

def test_approve_cooking_cancel_writes_audit_log():
    # Setup cooking item with cancel request
    # Manager approves
    # Assert: audit_logs has entry with action='approve_cancel', reason non-null

def test_table_transfer_writes_audit_log():
    # Transfer table
    # Assert: audit_logs has entry with action='transfer_table'

def test_audit_log_is_insert_only():
    # Use DB user with standard privileges
    # Attempt UPDATE on audit_log record
    # Assert: PermissionError or DB integrity error raised
```

---

## 4. Authentication & RBAC Tests

```python
# RBAC enforcement — every role/endpoint combination in the permission matrix
def test_staff_cannot_access_payments():
    response = client.post("/api/payments", headers=staff_auth_headers, ...)
    assert response.status_code == 403

def test_cashier_cannot_confirm_orders():
    response = client.patch(f"/api/orders/{order_id}/confirm", headers=cashier_auth_headers)
    assert response.status_code == 403

def test_kitchen_cannot_view_reports():
    response = client.get("/api/reports/daily", headers=kitchen_auth_headers)
    assert response.status_code == 403

def test_expired_jwt_returns_401():
    # Use expired token
    assert response.status_code == 401

def test_customer_cannot_access_staff_endpoints():
    # Use session_id header instead of JWT
    response = client.get("/api/orders/pending", headers={"X-Session-ID": session_id})
    assert response.status_code == 403
```

---

## 5. Calculation Tests

```python
# Tax calculation
def test_order_total_calculation():
    # subtotal = 100,000
    # VAT = 8% → tax_amount = 8,000
    # service_charge = 5% → 5,000
    # total_price = 113,000
    assert order.total_price == Decimal("113000.00")

# price snapshot
def test_unit_price_snapshot():
    item = create_menu_item(price=50000)
    order_detail = create_order_detail(item)
    update_menu_item_price(item, new_price=60000)
    
    refreshed = get_order_detail(order_detail.id)
    assert refreshed.unit_price == Decimal("50000.00")

# Split bill
def test_split_bill_totals_match_session_total():
    # Create split where Guest 1 gets items A, Guest 2 gets items B
    # Verify: payment_A + payment_B == session total (with proportional tax)
```

---

## 6. WebSocket Tests

```python
# Backend WS tests using FastAPI TestClient
def test_ws_order_update_broadcast():
    # Connect WS client to /ws/orders/{session_id}
    # Staff confirms order
    # Assert WS message received: {"event": "ORDER_UPDATED", ...}

def test_ws_menu_item_disabled_broadcast():
    # Connect customer WS
    # Kitchen reports out-of-stock
    # Assert: MENU_ITEM_DISABLED event received

def test_ws_auth_rejection():
    # Connect to /ws/orders/{invalid_session_id}
    # Assert: connection closed with code 4001
```

---

## 7. Test Data Strategy

### 7.1 Fixtures

```python
# conftest.py
@pytest.fixture
def db():
    # PostgreSQL test DB (Docker)
    # Rollback after each test — no persistent state

@pytest.fixture
def admin_user(db): ...
@pytest.fixture
def staff_user(db): ...
@pytest.fixture
def cashier_user(db): ...
@pytest.fixture
def kitchen_user(db): ...
@pytest.fixture
def empty_table(db): ...
@pytest.fixture
def open_session(db, empty_table): ...
@pytest.fixture
def pending_order(db, open_session): ...
@pytest.fixture
def active_tax_config(db): ...
```

### 7.2 Test Data Rules

- Never use production data in tests.
- Test DB is reset between test runs (not between individual tests — use transactions for speed).
- Monetary values in test fixtures use `Decimal` — never raw Python float.
- Do not hardcode entity IDs in test assertions — use created object references.

---

## 8. Regression Prevention

### 8.1 PR Checklist (Enforce in CI)

Before merge, CI must verify:
- [ ] All BR-* tests pass
- [ ] All state machine transition tests pass
- [ ] New features have corresponding audit log tests
- [ ] RBAC tests pass for new endpoints
- [ ] No SQLite-only test patterns for business logic tests

### 8.2 Regression Suite

Tag critical tests with `@pytest.mark.regression` and run on every PR:

```python
@pytest.mark.regression
def test_cooking_cancel_requires_manager_approval(): ...

@pytest.mark.regression
def test_audit_log_written_on_every_state_change(): ...

@pytest.mark.regression
def test_payment_requires_cashier_role(): ...
```

---

## 9. What NOT to Test

| Do Not Test | Reason |
|---|---|
| SQLAlchemy ORM internals | Framework responsibility |
| FastAPI routing boilerplate | Framework responsibility |
| Out-of-scope features (delivery, loyalty) | Not implemented, not tested |
| UI aesthetics (pixel positions, color values) | Not appropriate for automated tests |

---

## 10. Agent Behavior Guidance

### For GitHub Copilot
- When Copilot generates test functions, verify the assertion checks the correct business rule — Copilot often generates weak assertions (e.g., `assert response.status_code == 200` without verifying the DB state).
- Do not accept tests that mock the state machine — always test against the real validator.

### For Cursor
- When adding new tests, follow the fixture pattern in Section 7. Do not create inline test data without fixture cleanup.
- If Cursor suggests generating a test for an out-of-scope feature (delivery, reservation) — reject it.

### For Claude Code / Continue
- Generate tests for BR-* rules first, before feature implementation tests.
- Every generated service method should include a paired test in the same PR.

### For Antigravity / OpenHands
- Test coverage % is not the primary metric — business rule correctness is.
- Prioritise: state machine tests > audit log tests > RBAC tests > calculation tests > API integration tests.

### For Windsurf / Roo Code
- Generated integration tests must use PostgreSQL (Docker fixture), never SQLite.
- Do not generate test doubles (mocks) for the database in integration tests — use real DB transactions.
