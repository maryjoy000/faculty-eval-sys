"""add session_version for 'log out of all other devices'

Revision ID: d8f3a6b2c9e1
Revises: c4e8b1a7d2f6
Create Date: 2026-09-22

Each login stores the identity's session_version in the Flask session and
the login manager re-checks it per request. "Log out of all other devices"
bumps the column, invalidating stale sessions while keeping the device that
pressed the button signed in.

Existing rows default to 1; sessions created before this deploy simply
require one fresh login.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd8f3a6b2c9e1'
down_revision = 'c4e8b1a7d2f6'
branch_labels = None
depends_on = None


def _add_column_if_missing(table_name, column):
    inspector = sa.inspect(op.get_bind())
    if column.name in {col["name"] for col in inspector.get_columns(table_name)}:
        print(f"skip {table_name}.{column.name} (already exists)")
        return
    op.add_column(table_name, column)
    print(f"added {table_name}.{column.name}")


def upgrade():
    _add_column_if_missing(
        'users',
        sa.Column(
            'session_version', sa.Integer(), nullable=False, server_default='1'
        ),
    )
    _add_column_if_missing(
        'students',
        sa.Column(
            'session_version', sa.Integer(), nullable=False, server_default='1'
        ),
    )


def downgrade():
    for table_name in ('students', 'users'):
        inspector = sa.inspect(op.get_bind())
        columns = {col["name"] for col in inspector.get_columns(table_name)}
        if 'session_version' in columns:
            op.drop_column(table_name, 'session_version')
