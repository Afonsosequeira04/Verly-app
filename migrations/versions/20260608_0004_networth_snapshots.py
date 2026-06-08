"""net worth snapshots

Revision ID: 20260608_0004
Revises: 20260608_0003
Create Date: 2026-06-08 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = '20260608_0004'
down_revision = '20260608_0003'
branch_labels = None
depends_on = None


def _has_table(bind, table_name):
    return sa.inspect(bind).has_table(table_name)


def upgrade():
    bind = op.get_bind()
    if _has_table(bind, 'net_worth_snapshots'):
        return

    op.create_table(
        'net_worth_snapshots',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('item_id', sa.Integer(), nullable=False),
        sa.Column('valor', sa.Float(), nullable=False, server_default='0'),
        sa.Column('currency', sa.String(length=10), nullable=True, server_default='EUR'),
        sa.Column('criado_em', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['item_id'], ['net_worth_items.id']),
    )
    op.create_index('ix_net_worth_snapshots_item_id', 'net_worth_snapshots', ['item_id'])


def downgrade():
    bind = op.get_bind()
    if _has_table(bind, 'net_worth_snapshots'):
        op.drop_table('net_worth_snapshots')
