"""Initial schema — Smart Restaurant OS v2.0

Creates all tables following FK dependency order (database.rule.md Section 2):
1. categories
2. menu_items          (FK → categories)
3. staff_users
4. tax_config          (FK → staff_users via created_by)
5. tables
6. sessions            (FK → tables; self-referential FK → sessions)
7. orders              (FK → sessions)
8. order_details       (FK → orders, menu_items, staff_users)
9. payments            (FK → sessions, staff_users)
10. audit_logs         (FK → staff_users)

Revision ID: 001_initial
Revises:
Create Date: 2026-05-10
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ─── 1. categories (database.rule.md Section 3.10) ───
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.Text, nullable=False, unique=True),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="0"),
    )

    # ─── 2. menu_items (database.rule.md Section 3.9) ───
    op.create_table(
        "menu_items",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("category_id", sa.Integer, sa.ForeignKey("categories.id"), nullable=False),
        sa.Column("name", sa.Text, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("price", sa.Numeric(12, 2), nullable=False),
        sa.Column("image_url", sa.Text, nullable=True),
        sa.Column("is_available", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("display_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("price >= 0", name="chk_menu_items_price_non_negative"),
    )
    op.create_index("idx_menu_items_category", "menu_items", ["category_id"])
    op.create_index(
        "idx_menu_items_available",
        "menu_items",
        ["is_available"],
        postgresql_where=sa.text("is_available = TRUE"),
    )

    # ─── 3. staff_users (database.rule.md Section 3.8) ───
    op.create_table(
        "staff_users",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("username", sa.Text, nullable=False, unique=True),
        sa.Column("password_hash", sa.Text, nullable=False),
        sa.Column("role", sa.Text, nullable=False, server_default="staff"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("display_name", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "role IN ('staff','cashier','manager','admin','kitchen')",
            name="chk_staff_users_role",
        ),
    )

    # ─── 4. tax_config (database.rule.md Section 3.6) ───
    op.create_table(
        "tax_config",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("vat_rate", sa.Numeric(5, 4), nullable=False),
        sa.Column("service_charge_rate", sa.Numeric(5, 4), nullable=False),
        sa.Column("effective_from", sa.Date, nullable=False),
        sa.Column("created_by", sa.Integer, sa.ForeignKey("staff_users.id"), nullable=False),
        sa.CheckConstraint("vat_rate >= 0 AND vat_rate <= 1", name="chk_tax_config_vat_rate"),
        sa.CheckConstraint(
            "service_charge_rate >= 0 AND service_charge_rate <= 1",
            name="chk_tax_config_service_charge_rate",
        ),
    )

    # ─── 5. tables (database.rule.md Section 3.1) ───
    op.create_table(
        "tables",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("table_number", sa.Integer, nullable=False, unique=True),
        sa.Column("qr_code_url", sa.Text, nullable=False),
        sa.Column("status", sa.Text, nullable=False, server_default="empty"),
        sa.Column("floor", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('empty', 'occupied', 'waiting_payment')",
            name="chk_tables_status",
        ),
    )

    # ─── 6. sessions (database.rule.md Section 3.2) ───
    op.create_table(
        "sessions",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("table_id", sa.Integer, sa.ForeignKey("tables.id"), nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.Text, nullable=False, server_default="open"),
        sa.Column("merged_into_session_id", sa.Integer, sa.ForeignKey("sessions.id"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('open', 'waiting_payment', 'closed', 'merged')",
            name="chk_sessions_status",
        ),
    )
    # BR-001: Only one open session per table — CRITICAL partial unique index
    op.create_index(
        "idx_sessions_one_open_per_table",
        "sessions",
        ["table_id"],
        unique=True,
        postgresql_where=sa.text("status = 'open'"),
    )
    op.create_index("idx_sessions_table_id", "sessions", ["table_id"])
    op.create_index("idx_sessions_status", "sessions", ["status"])

    # ─── 7. orders (database.rule.md Section 3.3) ───
    op.create_table(
        "orders",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("session_id", sa.Integer, sa.ForeignKey("sessions.id"), nullable=False),
        sa.Column("subtotal", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("tax_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("service_charge", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("total_price", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("order_status", sa.Text, nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "order_status IN ('pending', 'confirmed', 'completed', 'cancelled')",
            name="chk_orders_order_status",
        ),
    )
    op.create_index("idx_orders_session_id", "orders", ["session_id"])

    # ─── 8. order_details (database.rule.md Section 3.4) ───
    op.create_table(
        "order_details",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("order_id", sa.Integer, sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("item_id", sa.Integer, sa.ForeignKey("menu_items.id"), nullable=False),
        sa.Column("quantity", sa.Integer, nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("note", sa.Text, nullable=True),
        sa.Column("cooking_status", sa.Text, nullable=False, server_default="pending"),
        sa.Column("cancel_reason", sa.Text, nullable=True),
        sa.Column("split_label", sa.Text, nullable=True),
        sa.Column("cancelled_by", sa.Integer, sa.ForeignKey("staff_users.id"), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("quantity > 0", name="chk_quantity_positive"),
        sa.CheckConstraint(
            "cooking_status IN ('pending','confirmed','cooking','done','served','cancelled')",
            name="chk_order_details_cooking_status",
        ),
        # BR-003 partial: cancelled records MUST have cancel_reason
        sa.CheckConstraint(
            "cooking_status != 'cancelled' OR cancel_reason IS NOT NULL",
            name="chk_cancel_reason",
        ),
    )
    op.create_index("idx_order_details_order_id", "order_details", ["order_id"])
    op.create_index("idx_order_details_cooking_status", "order_details", ["cooking_status"])

    # ─── 9. payments (database.rule.md Section 3.5) ───
    op.create_table(
        "payments",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("session_id", sa.Integer, sa.ForeignKey("sessions.id"), nullable=False),
        sa.Column("cashier_id", sa.Integer, sa.ForeignKey("staff_users.id"), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("payment_method", sa.Text, nullable=False),
        sa.Column("transaction_ref", sa.Text, nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("split_label", sa.Text, nullable=True),
        sa.Column("status", sa.Text, nullable=False, server_default="completed"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("amount > 0", name="chk_payment_amount_positive"),
        sa.CheckConstraint(
            "payment_method IN ('cash','card','transfer','voucher')",
            name="chk_payments_payment_method",
        ),
        sa.CheckConstraint(
            "status IN ('completed','refunded')",
            name="chk_payments_status",
        ),
    )
    op.create_index("idx_payments_session_id", "payments", ["session_id"])

    # ─── 10. audit_logs (database.rule.md Section 3.7) ───
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("actor_id", sa.Integer, sa.ForeignKey("staff_users.id"), nullable=True),
        sa.Column("actor_type", sa.Text, nullable=False),
        sa.Column("action", sa.Text, nullable=False),
        sa.Column("entity_type", sa.Text, nullable=False),
        sa.Column("entity_id", sa.Integer, nullable=False),
        sa.Column("before_state", JSONB, nullable=True),
        sa.Column("after_state", JSONB, nullable=True),
        sa.Column("reason", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "actor_type IN ('customer','staff','cashier','manager','admin','system')",
            name="chk_audit_logs_actor_type",
        ),
        sa.CheckConstraint(
            "entity_type IN ('order_detail','order','session','payment')",
            name="chk_audit_logs_entity_type",
        ),
    )
    op.create_index("idx_audit_logs_entity", "audit_logs", ["entity_type", "entity_id"])
    op.create_index("idx_audit_logs_actor", "audit_logs", ["actor_id"])
    op.create_index(
        "idx_audit_logs_created_at",
        "audit_logs",
        [sa.text("created_at DESC")],
    )

    # ─── Trigger: set_updated_at (database.rule.md Section 4) ───
    op.execute("""
        CREATE OR REPLACE FUNCTION set_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    # Apply trigger to all mutable tables (Section 4)
    for table_name in [
        "sessions", "orders", "order_details", "payments",
        "staff_users", "menu_items", "tables",
    ]:
        op.execute(f"""
            CREATE TRIGGER trg_set_updated_at_{table_name}
            BEFORE UPDATE ON {table_name}
            FOR EACH ROW EXECUTE FUNCTION set_updated_at();
        """)

    # ─── Audit Log Integrity (database.rule.md Section 7) ───
    # Revoke UPDATE and DELETE on audit_logs from app_user
    # Note: Run these after creating the app_user role
    op.execute("""
        DO $$
        BEGIN
            -- Only revoke if the role exists
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
                EXECUTE 'REVOKE UPDATE ON audit_logs FROM app_user';
                EXECUTE 'REVOKE DELETE ON audit_logs FROM app_user';
            END IF;
        END $$;
    """)


def downgrade() -> None:
    # Drop in reverse dependency order
    op.drop_table("audit_logs")
    op.drop_table("payments")
    op.drop_table("order_details")
    op.drop_table("orders")
    op.drop_table("sessions")
    op.drop_table("tables")
    op.drop_table("tax_config")
    op.drop_table("staff_users")
    op.drop_table("menu_items")
    op.drop_table("categories")

    # Drop the trigger function
    op.execute("DROP FUNCTION IF EXISTS set_updated_at() CASCADE;")
