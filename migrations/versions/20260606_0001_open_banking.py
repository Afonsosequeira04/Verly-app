"""open banking tables

Revision ID: 20260606_0001
Revises:
Create Date: 2026-06-06 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = '20260606_0001'
down_revision = None
branch_labels = None
depends_on = None


def _has_table(bind, table_name):
    return sa.inspect(bind).has_table(table_name)


def _has_column(bind, table_name, column_name):
    if not _has_table(bind, table_name):
        return False
    return column_name in {column['name'] for column in sa.inspect(bind).get_columns(table_name)}


def upgrade():
    bind = op.get_bind()

    if _has_table(bind, 'contas_bancarias') and not _has_column(bind, 'contas_bancarias', 'ativa'):
        op.add_column('contas_bancarias', sa.Column('ativa', sa.Boolean(), nullable=True, server_default=sa.true()))

    if not _has_table(bind, 'open_banking_connections'):
        op.create_table(
            'open_banking_connections',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('provider', sa.String(length=40), nullable=False, server_default='enablebanking'),
            sa.Column('institution_id', sa.String(length=100), nullable=False),
            sa.Column('requisition_id', sa.String(length=100), nullable=True),
            sa.Column('reference', sa.String(length=120), nullable=False),
            sa.Column('status', sa.String(length=30), nullable=False, server_default='created'),
            sa.Column('redirect_url', sa.String(length=512), nullable=True),
            sa.Column('agreement_id', sa.String(length=100), nullable=True),
            sa.Column('error', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.Column('last_sync_at', sa.DateTime(), nullable=True),
            sa.Column('consent_expires_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
            sa.UniqueConstraint('reference'),
            sa.UniqueConstraint('requisition_id'),
        )

    if not _has_table(bind, 'bank_transactions'):
        op.create_table(
            'bank_transactions',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('conta_bancaria_id', sa.Integer(), nullable=False),
            sa.Column('provider', sa.String(length=40), nullable=False, server_default='enablebanking'),
            sa.Column('transaction_id', sa.String(length=160), nullable=True),
            sa.Column('transaction_hash', sa.String(length=64), nullable=False),
            sa.Column('booked_at', sa.Date(), nullable=True),
            sa.Column('value_date', sa.Date(), nullable=True),
            sa.Column('amount', sa.Float(), nullable=False, server_default='0'),
            sa.Column('currency', sa.String(length=10), nullable=True, server_default='EUR'),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('merchant_name', sa.String(length=200), nullable=True),
            sa.Column('categoria', sa.String(length=50), nullable=True, server_default='Outros'),
            sa.Column('raw_json', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['conta_bancaria_id'], ['contas_bancarias.id']),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
            sa.UniqueConstraint('transaction_hash'),
        )
        op.create_index('ix_bank_transactions_user_id', 'bank_transactions', ['user_id'])
        op.create_index('ix_bank_transactions_conta_bancaria_id', 'bank_transactions', ['conta_bancaria_id'])


def downgrade():
    bind = op.get_bind()
    if _has_table(bind, 'bank_transactions'):
        op.drop_table('bank_transactions')
    if _has_table(bind, 'open_banking_connections'):
        op.drop_table('open_banking_connections')
    if _has_column(bind, 'contas_bancarias', 'ativa'):
        op.drop_column('contas_bancarias', 'ativa')
