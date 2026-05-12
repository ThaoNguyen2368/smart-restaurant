"""Fix audit_logs actor_type constraint + cancel_reason constraint

Revision ID: 002_fix_actor_type
Revises: 001_initial
"""
from alembic import op

revision = '002_fix_actor_type'
down_revision = '001_initial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add 'kitchen' to audit_logs actor_type constraint
    op.drop_constraint('chk_audit_logs_actor_type', 'audit_logs', type_='check')
    op.create_check_constraint(
        'chk_audit_logs_actor_type',
        'audit_logs',
        "actor_type IN ('customer', 'staff', 'cashier', 'manager', 'admin', 'system', 'kitchen')"
    )

    # 2. Fix cancel_reason constraint:
    # Original was too strict — required cancel_reason for ALL cancelled items.
    # BR-003 only requires it when cancelling from 'cooking' status.
    # Remove the constraint since this validation is done at application level.
    op.drop_constraint('chk_cancel_reason', 'order_details', type_='check')


def downgrade() -> None:
    op.create_check_constraint(
        'chk_cancel_reason',
        'order_details',
        "cooking_status != 'cancelled' OR cancel_reason IS NOT NULL"
    )
    op.drop_constraint('chk_audit_logs_actor_type', 'audit_logs', type_='check')
    op.create_check_constraint(
        'chk_audit_logs_actor_type',
        'audit_logs',
        "actor_type IN ('customer', 'staff', 'cashier', 'manager', 'admin', 'system')"
    )
