"""student active/inactive status (login gate)

Revision ID: a4e6c8d12f37
Revises: f3d8b2c47a51
Create Date: 2026-09-30

Gives students the same active/inactive switch staff accounts have:
- New `students.status` ('active' / 'inactive', NOT NULL, defaults to
  'active' so every existing row keeps working).
- The login route rejects inactive students with a distinct 403 code
  (see app/routes/auth.py) so the frontend can pop an explanation;
  wrong passwords still get the generic 401 (no enumeration change).
- The session guard also rejects inactive students, so deactivating
  kicks out any live sessions.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a4e6c8d12f37'
down_revision = 'f3d8b2c47a51'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'students',
        sa.Column(
            'status',
            sa.String(length=20),
            nullable=False,
            server_default='active',
        ),
    )


def downgrade():
    op.drop_column('students', 'status')
