"""live deals watchlist

Revision ID: 20260613_0007
Revises: 20260613_0006
Create Date: 2026-06-13 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = '20260613_0007'
down_revision = '20260613_0006'
branch_labels = None
depends_on = None


def _has_table(bind, table_name):
    return sa.inspect(bind).has_table(table_name)


def upgrade():
    bind = op.get_bind()
    if _has_table(bind, 'deal_watchlist_items'):
        return
    op.create_table(
        'deal_watchlist_items',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('product_name', sa.String(length=220), nullable=False),
        sa.Column('category', sa.String(length=80), nullable=True, server_default='Outros'),
        sa.Column('target_price', sa.Float(), nullable=True),
        sa.Column('currency', sa.String(length=10), nullable=True, server_default='EUR'),
        sa.Column('urgency', sa.String(length=20), nullable=True, server_default='flexible'),
        sa.Column('budget_limit', sa.Float(), nullable=True),
        sa.Column('radius_km', sa.Float(), nullable=True, server_default='5'),
        sa.Column('lat', sa.Float(), nullable=True),
        sa.Column('lng', sa.Float(), nullable=True),
        sa.Column('active', sa.Boolean(), nullable=True, server_default=sa.text('true')),
        sa.Column('notify_price_drop', sa.Boolean(), nullable=True, server_default=sa.text('true')),
        sa.Column('notify_stock', sa.Boolean(), nullable=True, server_default=sa.text('true')),
        sa.Column('notify_coupon', sa.Boolean(), nullable=True, server_default=sa.text('true')),
        sa.Column('notify_good_time', sa.Boolean(), nullable=True, server_default=sa.text('true')),
        sa.Column('last_price', sa.Float(), nullable=True),
        sa.Column('last_store', sa.String(length=160), nullable=True),
        sa.Column('last_checked_at', sa.DateTime(), nullable=True),
        sa.Column('last_result_json', sa.Text(), nullable=True),
        sa.Column('last_alerts_json', sa.Text(), nullable=True),
        sa.Column('criado_em', sa.DateTime(), nullable=True),
        sa.Column('atualizado_em', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
    )
    op.create_index('ix_deal_watchlist_items_user_id', 'deal_watchlist_items', ['user_id'])
    op.create_index('ix_deal_watchlist_items_active', 'deal_watchlist_items', ['active'])


def downgrade():
    bind = op.get_bind()
    if _has_table(bind, 'deal_watchlist_items'):
        op.drop_table('deal_watchlist_items')
