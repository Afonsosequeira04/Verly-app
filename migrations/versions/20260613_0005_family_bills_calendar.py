"""family bills calendar preferences

Revision ID: 20260613_0005
Revises: 20260608_0004
Create Date: 2026-06-13 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = '20260613_0005'
down_revision = '20260608_0004'
branch_labels = None
depends_on = None


def _has_table(bind, table_name):
    return sa.inspect(bind).has_table(table_name)


def _has_column(bind, table_name, column_name):
    if not _has_table(bind, table_name):
        return False
    return any(col['name'] == column_name for col in sa.inspect(bind).get_columns(table_name))


def upgrade():
    bind = op.get_bind()

    if not _has_column(bind, 'users', 'moeda_preferida'):
        op.add_column('users', sa.Column('moeda_preferida', sa.String(length=10), nullable=True, server_default='EUR'))

    if not _has_table(bind, 'family_plans'):
        op.create_table(
            'family_plans',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('nome', sa.String(length=120), nullable=False),
            sa.Column('owner_id', sa.Integer(), nullable=False),
            sa.Column('orcamento_mensal', sa.Float(), nullable=True, server_default='0'),
            sa.Column('currency', sa.String(length=10), nullable=True, server_default='EUR'),
            sa.Column('ativo', sa.Boolean(), nullable=True, server_default=sa.true()),
            sa.Column('criado_em', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['owner_id'], ['users.id']),
        )
        op.create_index('ix_family_plans_owner_id', 'family_plans', ['owner_id'])

    if not _has_table(bind, 'family_members'):
        op.create_table(
            'family_members',
            sa.Column('family_id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('role', sa.String(length=20), nullable=True, server_default='member'),
            sa.Column('joined_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['family_id'], ['family_plans.id']),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
            sa.PrimaryKeyConstraint('family_id', 'user_id'),
        )

    if not _has_table(bind, 'bills'):
        op.create_table(
            'bills',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('titulo', sa.String(length=160), nullable=False),
            sa.Column('categoria', sa.String(length=80), nullable=True, server_default='Obrigacao'),
            sa.Column('valor', sa.Float(), nullable=True, server_default='0'),
            sa.Column('currency', sa.String(length=10), nullable=True, server_default='EUR'),
            sa.Column('data_vencimento', sa.Date(), nullable=False),
            sa.Column('recorrencia', sa.String(length=20), nullable=True, server_default='none'),
            sa.Column('notas', sa.Text(), nullable=True),
            sa.Column('pago', sa.Boolean(), nullable=True, server_default=sa.false()),
            sa.Column('lembrar_dias_antes', sa.Integer(), nullable=True, server_default='3'),
            sa.Column('calendar_event_id', sa.String(length=160), nullable=True),
            sa.Column('criado_em', sa.DateTime(), nullable=True),
            sa.Column('atualizado_em', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        )
        op.create_index('ix_bills_user_id', 'bills', ['user_id'])
        op.create_index('ix_bills_data_vencimento', 'bills', ['data_vencimento'])

    if not _has_table(bind, 'calendar_connections'):
        op.create_table(
            'calendar_connections',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('provider', sa.String(length=30), nullable=False),
            sa.Column('account_email', sa.String(length=200), nullable=True),
            sa.Column('status', sa.String(length=30), nullable=True, server_default='not_configured'),
            sa.Column('credentials_json', sa.Text(), nullable=True),
            sa.Column('last_sync_at', sa.DateTime(), nullable=True),
            sa.Column('criado_em', sa.DateTime(), nullable=True),
            sa.Column('atualizado_em', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        )
        op.create_index('ix_calendar_connections_user_id', 'calendar_connections', ['user_id'])


def downgrade():
    bind = op.get_bind()
    for table in ('calendar_connections', 'bills', 'family_members', 'family_plans'):
        if _has_table(bind, table):
            op.drop_table(table)
    if _has_column(bind, 'users', 'moeda_preferida'):
        op.drop_column('users', 'moeda_preferida')
