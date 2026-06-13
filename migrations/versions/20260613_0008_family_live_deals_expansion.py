"""family plan expansion

Revision ID: 20260613_0008
Revises: 20260613_0007
Create Date: 2026-06-13 00:08:00
"""
from alembic import op
import sqlalchemy as sa

revision = '20260613_0008'
down_revision = '20260613_0007'
branch_labels = None
depends_on = None


def _has_table(bind, table_name):
    return sa.inspect(bind).has_table(table_name)


def upgrade():
    bind = op.get_bind()

    if not _has_table(bind, 'family_invites'):
        op.create_table(
            'family_invites',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('family_id', sa.Integer(), nullable=False),
            sa.Column('invited_email', sa.String(length=150), nullable=False),
            sa.Column('invited_user_id', sa.Integer(), nullable=True),
            sa.Column('token', sa.String(length=80), nullable=False),
            sa.Column('role', sa.String(length=20), nullable=True, server_default='partner'),
            sa.Column('status', sa.String(length=20), nullable=True, server_default='pending'),
            sa.Column('created_by', sa.Integer(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('expires_at', sa.DateTime(), nullable=True),
            sa.Column('responded_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['family_id'], ['family_plans.id']),
            sa.ForeignKeyConstraint(['invited_user_id'], ['users.id']),
            sa.ForeignKeyConstraint(['created_by'], ['users.id']),
            sa.UniqueConstraint('token', name='uq_family_invite_token'),
        )
        op.create_index('ix_family_invites_family_id', 'family_invites', ['family_id'])
        op.create_index('ix_family_invites_invited_email', 'family_invites', ['invited_email'])
        op.create_index('ix_family_invites_invited_user_id', 'family_invites', ['invited_user_id'])
        op.create_index('ix_family_invites_status', 'family_invites', ['status'])

    if not _has_table(bind, 'family_shared_accounts'):
        op.create_table(
            'family_shared_accounts',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('family_id', sa.Integer(), nullable=False),
            sa.Column('conta_bancaria_id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('added_by', sa.Integer(), nullable=False),
            sa.Column('active', sa.Boolean(), nullable=True, server_default=sa.true()),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['family_id'], ['family_plans.id']),
            sa.ForeignKeyConstraint(['conta_bancaria_id'], ['contas_bancarias.id']),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
            sa.ForeignKeyConstraint(['added_by'], ['users.id']),
            sa.UniqueConstraint('family_id', 'conta_bancaria_id', name='uq_family_shared_account'),
        )
        op.create_index('ix_family_shared_accounts_family_id', 'family_shared_accounts', ['family_id'])
        op.create_index('ix_family_shared_accounts_conta_bancaria_id', 'family_shared_accounts', ['conta_bancaria_id'])
        op.create_index('ix_family_shared_accounts_user_id', 'family_shared_accounts', ['user_id'])

    if not _has_table(bind, 'family_category_budgets'):
        op.create_table(
            'family_category_budgets',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('family_id', sa.Integer(), nullable=False),
            sa.Column('category', sa.String(length=80), nullable=False),
            sa.Column('amount', sa.Float(), nullable=True, server_default='0'),
            sa.Column('currency', sa.String(length=10), nullable=True, server_default='EUR'),
            sa.Column('created_by', sa.Integer(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['family_id'], ['family_plans.id']),
            sa.ForeignKeyConstraint(['created_by'], ['users.id']),
            sa.UniqueConstraint('family_id', 'category', name='uq_family_category_budget'),
        )
        op.create_index('ix_family_category_budgets_family_id', 'family_category_budgets', ['family_id'])

    if not _has_table(bind, 'family_expense_tags'):
        op.create_table(
            'family_expense_tags',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('family_id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('source_type', sa.String(length=30), nullable=False),
            sa.Column('source_id', sa.Integer(), nullable=False),
            sa.Column('include_family', sa.Boolean(), nullable=True, server_default=sa.true()),
            sa.Column('category', sa.String(length=80), nullable=True),
            sa.Column('created_by', sa.Integer(), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['family_id'], ['family_plans.id']),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
            sa.ForeignKeyConstraint(['created_by'], ['users.id']),
            sa.UniqueConstraint('family_id', 'source_type', 'source_id', name='uq_family_expense_tag'),
        )
        op.create_index('ix_family_expense_tags_family_id', 'family_expense_tags', ['family_id'])
        op.create_index('ix_family_expense_tags_user_id', 'family_expense_tags', ['user_id'])


def downgrade():
    bind = op.get_bind()
    for table in (
        'family_expense_tags',
        'family_category_budgets',
        'family_shared_accounts',
        'family_invites',
    ):
        if _has_table(bind, table):
            op.drop_table(table)
