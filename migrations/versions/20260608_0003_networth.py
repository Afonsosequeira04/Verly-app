"""net worth items

Revision ID: 20260608_0003
Revises: 20260607_0002
Create Date: 2026-06-08 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = '20260608_0003'
down_revision = '20260607_0002'
branch_labels = None
depends_on = None


def _has_table(bind, table_name):
    return sa.inspect(bind).has_table(table_name)


def upgrade():
    bind = op.get_bind()
    if _has_table(bind, 'net_worth_items'):
        return

    op.create_table(
        'net_worth_items',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('nome', sa.String(length=160), nullable=False),
        sa.Column('tipo', sa.String(length=20), nullable=False, server_default='asset'),
        sa.Column('categoria', sa.String(length=80), nullable=False, server_default='Outros'),
        sa.Column('valor', sa.Float(), nullable=False, server_default='0'),
        sa.Column('currency', sa.String(length=10), nullable=True, server_default='EUR'),
        sa.Column('ativo', sa.Boolean(), nullable=True, server_default=sa.true()),
        sa.Column('criado_em', sa.DateTime(), nullable=True),
        sa.Column('atualizado_em', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
    )
    op.create_index('ix_net_worth_items_user_id', 'net_worth_items', ['user_id'])


def downgrade():
    bind = op.get_bind()
    if _has_table(bind, 'net_worth_items'):
        op.drop_table('net_worth_items')
