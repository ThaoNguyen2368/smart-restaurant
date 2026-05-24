"""add cashiershift

Revision ID: 003_add_cashiershift
Revises: 002_fix_actor_type
Create Date: 2026-05-24 12:28:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '003_add_cashiershift'
down_revision: Union[str, Sequence[str], None] = '002_fix_actor_type'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('cashier_shifts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('cashier_id', sa.Integer(), nullable=False),
        sa.Column('start_time', postgresql.TIMESTAMP(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('end_time', postgresql.TIMESTAMP(timezone=True), nullable=True),
        sa.Column('system_total', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column('actual_total', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column('difference', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.ForeignKeyConstraint(['cashier_id'], ['staff_users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_cashier_shifts_id'), 'cashier_shifts', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_cashier_shifts_id'), table_name='cashier_shifts')
    op.drop_table('cashier_shifts')
