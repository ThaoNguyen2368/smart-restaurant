# database.rule.md — Smart Restaurant OS
# Database Engineering Rules

> **Database:** PostgreSQL 15+  
> **ORM:** SQLAlchemy (Python)  
> **Migrations:** Alembic  
> **Read after:** `skill.md` → `domain.rule.md` → `backend.rule.md` → this file

---

## 1. Database Selection

**PostgreSQL 15+ is the ONLY permitted production database.**

| Environment | Permitted DB |
|---|---|
| Production | PostgreSQL 15+ |
| Staging | PostgreSQL 15+ |
| Development | PostgreSQL 15+ |
| Unit Tests (isolated) | SQLite (in-memory only, no file persistence) |
| CI/CD integration tests | PostgreSQL 15+ (via Docker) |

> **Fail condition:** Any migration or ORM model written targeting SQLite syntax is a defect. Check for `AUTOINCREMENT` (SQLite) vs `SERIAL` / `GENERATED ALWAYS AS IDENTITY` (PostgreSQL).

---

## 2. ORM Model Creation Order

Dependencies must be resolved in this order. Violating this order breaks foreign key migrations:

```
1.  categories
2.  menu_items          (FK → categories)
3.  staff_users
4.  tax_config          (FK → staff_users via created_by)
5.  tables
6.  sessions            (FK → tables; self-referential FK → sessions)
7.  orders              (FK → sessions)
8.  order_details       (FK → orders, menu_items, staff_users)
9.  payments            (FK → sessions, staff_users)
10. audit_logs          (FK → staff_users)
```

---

## 3. Table Definitions & Constraints

### 3.1 `tables`

```sql
CREATE TABLE tables (
    id              SERIAL PRIMARY KEY,
    table_number    INTEGER NOT NULL UNIQUE,
    qr_code_url     TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'empty'
                    CHECK (status IN ('empty', 'occupied', 'waiting_payment')),
    floor           TEXT
);
```

### 3.2 `sessions`

```sql
CREATE TABLE sessions (
    id                      SERIAL PRIMARY KEY,
    table_id                INTEGER NOT NULL REFERENCES tables(id),
    opened_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at               TIMESTAMPTZ,
    status                  TEXT NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open', 'waiting_payment', 'closed', 'merged')),
    merged_into_session_id  INTEGER REFERENCES sessions(id)
);

-- Critical constraint: only one open session per table
CREATE UNIQUE INDEX idx_sessions_one_open_per_table
    ON sessions (table_id)
    WHERE status = 'open';
```

> **This partial unique index enforces BR-001 at the DB level.** Do not remove it.

### 3.3 `orders`

```sql
CREATE TABLE orders (
    id              SERIAL PRIMARY KEY,
    session_id      INTEGER NOT NULL REFERENCES sessions(id),
    subtotal        NUMERIC(12, 2) NOT NULL DEFAULT 0,
    tax_amount      NUMERIC(12, 2) NOT NULL DEFAULT 0,
    service_charge  NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_price     NUMERIC(12, 2) NOT NULL DEFAULT 0,
    order_status    TEXT NOT NULL DEFAULT 'pending'
                    CHECK (order_status IN ('pending', 'confirmed', 'completed', 'cancelled')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

> **Use `NUMERIC(12, 2)` for all monetary values — NOT `REAL` or `FLOAT`.** Floating-point types are imprecise for currency arithmetic.

### 3.4 `order_details`

```sql
CREATE TABLE order_details (
    id              SERIAL PRIMARY KEY,
    order_id        INTEGER NOT NULL REFERENCES orders(id),
    item_id         INTEGER NOT NULL REFERENCES menu_items(id),
    quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price      NUMERIC(12, 2) NOT NULL,      -- immutable snapshot
    note            TEXT,
    cooking_status  TEXT NOT NULL DEFAULT 'pending'
                    CHECK (cooking_status IN ('pending','confirmed','cooking','done','served','cancelled')),
    cancel_reason   TEXT,
    cancelled_by    INTEGER REFERENCES staff_users(id),
    cancelled_at    TIMESTAMPTZ,
    CONSTRAINT chk_cancel_reason CHECK (
        cooking_status != 'cancelled' OR cancel_reason IS NOT NULL
    )
);
```

> **The `chk_cancel_reason` constraint enforces that cancelled records always have a reason. This is a DB-level enforcement of BR-003 (partial — the full rule requires manager approval at service level).**

### 3.5 `payments`

```sql
CREATE TABLE payments (
    id              SERIAL PRIMARY KEY,
    session_id      INTEGER NOT NULL REFERENCES sessions(id),
    cashier_id      INTEGER NOT NULL REFERENCES staff_users(id),
    amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_method  TEXT NOT NULL CHECK (payment_method IN ('cash','card','transfer','voucher')),
    transaction_ref TEXT,
    paid_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    split_label     TEXT,
    status          TEXT NOT NULL DEFAULT 'completed'
                    CHECK (status IN ('completed','refunded'))
);
```

### 3.6 `tax_config`

```sql
CREATE TABLE tax_config (
    id                  SERIAL PRIMARY KEY,
    vat_rate            NUMERIC(5, 4) NOT NULL CHECK (vat_rate >= 0 AND vat_rate <= 1),
    service_charge_rate NUMERIC(5, 4) NOT NULL CHECK (service_charge_rate >= 0 AND service_charge_rate <= 1),
    effective_from      DATE NOT NULL,
    created_by          INTEGER NOT NULL REFERENCES staff_users(id)
);
```

### 3.7 `audit_logs`

```sql
CREATE TABLE audit_logs (
    id           SERIAL PRIMARY KEY,
    actor_id     INTEGER REFERENCES staff_users(id),     -- NULL if actor is customer
    actor_type   TEXT NOT NULL CHECK (actor_type IN ('customer','staff','cashier','manager','admin','system')),
    action       TEXT NOT NULL,
    entity_type  TEXT NOT NULL CHECK (entity_type IN ('order_detail','order','session','payment')),
    entity_id    INTEGER NOT NULL,
    before_state JSONB,
    after_state  JSONB,
    reason       TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforce INSERT-only via revoked privileges (see Section 7)
-- No UPDATE, no DELETE permitted
```

### 3.8 `staff_users`

```sql
CREATE TABLE staff_users (
    id            SERIAL PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'staff'
                  CHECK (role IN ('staff','cashier','manager','admin','kitchen')),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    display_name  TEXT NOT NULL
);
```

### 3.9 `menu_items`

```sql
CREATE TABLE menu_items (
    id            SERIAL PRIMARY KEY,
    category_id   INTEGER NOT NULL REFERENCES categories(id),
    name          TEXT NOT NULL,
    description   TEXT,
    price         NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
    image_url     TEXT,
    is_available  BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 0
);
```

### 3.10 `categories`

```sql
CREATE TABLE categories (
    id            SERIAL PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    display_order INTEGER NOT NULL DEFAULT 0
);
```

---

## 4. Audit Fields

Every table that is mutated after creation MUST include:

| Field | Type | Rule |
|---|---|---|
| `created_at` | `TIMESTAMPTZ DEFAULT NOW()` | Set on insert, never changed |
| `updated_at` | `TIMESTAMPTZ` | Updated via trigger or ORM `onupdate` |

Exceptions: `audit_logs` (append-only), `tax_config` (immutable after creation).

**Trigger pattern for `updated_at`:**
```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to: sessions, orders, order_details, payments, staff_users, menu_items, tables
CREATE TRIGGER trg_set_updated_at_<table>
BEFORE UPDATE ON <table>
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## 5. Soft Delete

**Hard DELETE is FORBIDDEN for these entities:**

| Entity | Soft Delete Mechanism |
|---|---|
| `staff_users` | `is_active = FALSE` |
| `menu_items` | `is_available = FALSE` |
| `categories` | `is_available = FALSE` (add if needed) |
| `sessions` | `status = 'closed'` or `'merged'` |
| `orders` | `order_status = 'cancelled'` |
| `order_details` | `cooking_status = 'cancelled'` |

**Hard DELETE permitted only for:**
- `tables` (no operational data — only by Admin, no sessions open)
- `categories` (only if no associated menu_items exist)

---

## 6. Indexes

```sql
-- Hot path performance indexes (required)
CREATE INDEX idx_sessions_table_id ON sessions(table_id);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_orders_session_id ON orders(session_id);
CREATE INDEX idx_order_details_order_id ON order_details(order_id);
CREATE INDEX idx_order_details_cooking_status ON order_details(cooking_status);
CREATE INDEX idx_payments_session_id ON payments(session_id);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);  -- for cursor pagination
CREATE INDEX idx_menu_items_category ON menu_items(category_id);
CREATE INDEX idx_menu_items_available ON menu_items(is_available) WHERE is_available = TRUE;
```

---

## 7. Audit Log Integrity — DB-Level Enforcement

Revoke UPDATE and DELETE privileges on `audit_logs` from the application database user:

```sql
-- After creating the app DB user (e.g., 'app_user'):
REVOKE UPDATE ON audit_logs FROM app_user;
REVOKE DELETE ON audit_logs FROM app_user;

-- Optionally: create a separate audit user with INSERT-only
CREATE USER audit_writer WITH PASSWORD '...';
GRANT INSERT ON audit_logs TO audit_writer;
```

---

## 8. Migration Safety Rules

### 8.1 Alembic Rules

- Every schema change MUST have a corresponding Alembic migration.
- Never manually alter the production schema without a migration file.
- Migration files are reviewed before deployment — they cannot be reverted automatically.

### 8.2 Migration Checklist

Before every migration:
- [ ] Does it include a `downgrade()` function?
- [ ] Does it respect the FK dependency order (Section 2)?
- [ ] Does it use `NUMERIC` for monetary columns (not `REAL`)?
- [ ] Does it include appropriate indexes?
- [ ] Does it NOT add columns that are out-of-scope (delivery, reservation, loyalty)?
- [ ] Is it tested against a PostgreSQL staging instance (not SQLite)?

### 8.3 Dangerous Operations (Require Extra Review)

These operations require DBA review before production execution:

| Operation | Risk |
|---|---|
| DROP TABLE | Data loss — forbidden without archival strategy |
| DROP COLUMN | Data loss — use soft deprecation first |
| ALTER COLUMN TYPE | May fail on existing data — test with data volume |
| ADD NOT NULL COLUMN without DEFAULT | Will fail on non-empty table |
| Removing CHECK constraints | Loosens data integrity |

---

## 9. Data Consistency Rules

- All monetary calculations use PostgreSQL `NUMERIC` arithmetic, not Python float.
- All timestamps stored as `TIMESTAMPTZ` (UTC). Display conversion happens in application layer.
- The `unit_price` field in `order_details` is populated at INSERT time from `menu_items.price`. It is never recalculated or updated after insert.
- `orders.total_price` = `subtotal + tax_amount + service_charge`. This formula is enforced at application level on every order write.
- The active tax config = `SELECT * FROM tax_config WHERE effective_from <= NOW() ORDER BY effective_from DESC LIMIT 1`.

---

## 10. Connection Pooling

- Use PgBouncer or SQLAlchemy connection pool for production.
- Pool size: minimum 5, maximum 20 per instance.
- Connection timeout: 30 seconds.
- Idle timeout: 600 seconds.

---

## 11. Agent Behavior Guidance

### For GitHub Copilot
- Never accept `REAL` or `FLOAT` for monetary columns — always correct to `NUMERIC(12,2)`.
- When generating FK definitions, verify the target table exists in the dependency order (Section 2).

### For Cursor
- When refactoring ORM models, maintain the field order and constraints as defined in Section 3.
- Do not add `nullable=True` to fields defined as `NOT NULL` without explicit requirements change.

### For Claude Code / Continue
- Generate migration files in Alembic format. Include both `upgrade()` and `downgrade()` functions.
- The partial unique index in Section 3.2 (`idx_sessions_one_open_per_table`) MUST be generated — it enforces BR-001.

### For Antigravity / Windsurf / OpenHands
- Do not generate tables for out-of-scope features (delivery_address, reservation, inventory, loyalty_points).
- All generated CHECK constraints must match ERS Section 6 values exactly — no invented status values.

### For Roo Code
- Generated seed data scripts must not hard-delete from `audit_logs` or `sessions`.
- Test data setup must use PostgreSQL — do not scaffold SQLite test fixtures for integration tests.
