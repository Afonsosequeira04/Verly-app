"""social shared expenses

Revision ID: 20260607_0002
Revises: 20260606_0001
Create Date: 2026-06-07 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = '20260607_0002'
down_revision = '20260606_0001'
branch_labels = None
depends_on = None


def _has_table(bind, table_name):
    return sa.inspect(bind).has_table(table_name)


def upgrade():
    bind = op.get_bind()

    if not _has_table(bind, 'despesas_grupo'):
        op.create_table(
            'despesas_grupo',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('grupo_id', sa.Integer(), nullable=False),
            sa.Column('pagador_id', sa.Integer(), nullable=False),
            sa.Column('criado_por_id', sa.Integer(), nullable=False),
            sa.Column('descricao', sa.String(length=180), nullable=False),
            sa.Column('categoria', sa.String(length=80), nullable=True, server_default='Geral'),
            sa.Column('valor', sa.Float(), nullable=False),
            sa.Column('data', sa.Date(), nullable=False),
            sa.Column('notas', sa.String(length=500), nullable=True),
            sa.Column('ativo', sa.Boolean(), nullable=True, server_default=sa.true()),
            sa.Column('criado_em', sa.DateTime(), nullable=True),
            sa.Column('atualizado_em', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['grupo_id'], ['grupos.id']),
            sa.ForeignKeyConstraint(['pagador_id'], ['users.id']),
            sa.ForeignKeyConstraint(['criado_por_id'], ['users.id']),
        )
        op.create_index('ix_despesas_grupo_grupo_id', 'despesas_grupo', ['grupo_id'])
        op.create_index('ix_despesas_grupo_pagador_id', 'despesas_grupo', ['pagador_id'])

    if not _has_table(bind, 'despesa_grupo_participantes'):
        op.create_table(
            'despesa_grupo_participantes',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('despesa_id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('valor', sa.Float(), nullable=False),
            sa.Column('liquidado', sa.Boolean(), nullable=True, server_default=sa.false()),
            sa.ForeignKeyConstraint(['despesa_id'], ['despesas_grupo.id']),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
            sa.UniqueConstraint('despesa_id', 'user_id'),
        )
        op.create_index('ix_despesa_grupo_participantes_despesa_id', 'despesa_grupo_participantes', ['despesa_id'])
        op.create_index('ix_despesa_grupo_participantes_user_id', 'despesa_grupo_participantes', ['user_id'])


def downgrade():
    bind = op.get_bind()
    if _has_table(bind, 'despesa_grupo_participantes'):
        op.drop_table('despesa_grupo_participantes')
    if _has_table(bind, 'despesas_grupo'):
        op.drop_table('despesas_grupo')
