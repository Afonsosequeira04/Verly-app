"""add chat thread metadata

Revision ID: 20260615_0009
Revises: 20260613_0008
Create Date: 2026-06-15
"""

from alembic import op
import sqlalchemy as sa


revision = '20260615_0009'
down_revision = '20260613_0008'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('conversas') as batch_op:
        batch_op.add_column(sa.Column('thread_id', sa.String(length=36), nullable=True))
        batch_op.add_column(sa.Column('thread_title', sa.String(length=160), nullable=True))
        batch_op.create_index('ix_conversas_thread_id', ['thread_id'])


def downgrade():
    with op.batch_alter_table('conversas') as batch_op:
        batch_op.drop_index('ix_conversas_thread_id')
        batch_op.drop_column('thread_title')
        batch_op.drop_column('thread_id')
