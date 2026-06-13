"""refund radar states

Revision ID: 20260613_0006
Revises: 20260613_0005
Create Date: 2026-06-13 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = '20260613_0006'
down_revision = '20260613_0005'
branch_labels = None
depends_on = None


def _has_table(bind, table_name):
    return sa.inspect(bind).has_table(table_name)


def upgrade():
    bind = op.get_bind()
    if _has_table(bind, 'refund_opportunity_states'):
        return
    op.create_table(
        'refund_opportunity_states',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('opportunity_key', sa.String(length=220), nullable=False),
        sa.Column('status', sa.String(length=30), nullable=True, server_default='new'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('recovered_amount', sa.Float(), nullable=True, server_default='0'),
        sa.Column('currency', sa.String(length=10), nullable=True, server_default='EUR'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.UniqueConstraint('user_id', 'opportunity_key', name='uq_refund_state_user_key'),
    )
    op.create_index('ix_refund_opportunity_states_user_id', 'refund_opportunity_states', ['user_id'])


def downgrade():
    bind = op.get_bind()
    if _has_table(bind, 'refund_opportunity_states'):
        op.drop_table('refund_opportunity_states')
