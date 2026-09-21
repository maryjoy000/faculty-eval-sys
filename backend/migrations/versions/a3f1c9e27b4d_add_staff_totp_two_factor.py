"""add staff TOTP two-factor support

Revision ID: a3f1c9e27b4d
Revises: cb5c5f5fb19d
Create Date: 2026-09-21

Adds TOTP secret storage + attempt tracking to users, a backup_codes
table for one-time recovery codes, and resets stale two_factor_enabled
flags that were toggled before any authenticator was ever enrolled
(those accounts would otherwise be locked out of the new verify step).
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a3f1c9e27b4d'
down_revision = 'cb5c5f5fb19d'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('totp_secret', sa.Text(), nullable=True))
    op.add_column('users', sa.Column(
        'totp_failed_attempts', sa.Integer(), nullable=False, server_default='0'
    ))
    op.add_column('users', sa.Column('totp_locked_until', sa.DateTime(), nullable=True))
    op.add_column('users', sa.Column('totp_last_counter', sa.Integer(), nullable=True))
    op.add_column('users', sa.Column('totp_last_code_hash', sa.String(length=64), nullable=True))
    op.add_column('users', sa.Column('totp_last_code_at', sa.DateTime(), nullable=True))

    op.create_table(
        'backup_codes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('code_hash', sa.String(length=255), nullable=False),
        sa.Column('used', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('used_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )

    # Data fix: flags flipped ON before TOTP existed have no secret and
    # could never pass verification — reset them so owners re-enroll.
    op.execute(
        "UPDATE users SET two_factor_enabled = 0, totp_failed_attempts = 0 "
        "WHERE totp_secret IS NULL"
    )


def downgrade():
    op.drop_table('backup_codes')
    op.drop_column('users', 'totp_last_code_at')
    op.drop_column('users', 'totp_last_code_hash')
    op.drop_column('users', 'totp_last_counter')
    op.drop_column('users', 'totp_locked_until')
    op.drop_column('users', 'totp_failed_attempts')
    op.drop_column('users', 'totp_secret')
