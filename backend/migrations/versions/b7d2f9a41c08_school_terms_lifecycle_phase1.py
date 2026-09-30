"""school terms lifecycle + per-term weighting/periods (Phase 1)

Revision ID: b7d2f9a41c08
Revises: a4e6c8d12f37
Create Date: 2026-09-30

Each School Year/Semester becomes a managed period:
- New `school_terms` (school_year, semester, status draft/open/closed).
  Seeded once from the current System Management settings as an open
  term, so existing deployments keep working with zero admin action.
- `evaluation_weightings.term_id` (nullable, unique): NULL stays the
  global default; a row with a term_id overrides it for that term only.
- `evaluation_periods.term_id` (nullable): periods created for a term
  link to it; legacy rows stay NULL and behave exactly as before.

Phase 2 will scope results/reporting by term and enforce closed-term
rules on submissions; this migration only adds the foundation.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b7d2f9a41c08'
down_revision = 'a4e6c8d12f37'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'school_terms',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('school_year', sa.String(length=20), nullable=False),
        sa.Column('semester', sa.String(length=20), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False,
                  server_default='draft'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('school_year', 'semester',
                            name='uq_school_terms_year_semester'),
    )

    # Seed the current term from System Management settings so the live
    # deployment transitions seamlessly (exactly one open term).
    op.execute(sa.text(
        "INSERT INTO school_terms (school_year, semester, status, "
        "created_at, updated_at) "
        "SELECT academic_year, semester, 'open', NOW(), NOW() "
        "FROM system_settings LIMIT 1"
    ))

    op.add_column(
        'evaluation_weightings',
        sa.Column('term_id', sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        'fk_weightings_term_id',
        'evaluation_weightings', 'school_terms',
        ['term_id'], ['id'],
    )
    op.create_unique_constraint(
        'uq_weightings_term_id',
        'evaluation_weightings', ['term_id'],
    )

    op.add_column(
        'evaluation_periods',
        sa.Column('term_id', sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        'fk_periods_term_id',
        'evaluation_periods', 'school_terms',
        ['term_id'], ['id'],
    )


def downgrade():
    op.drop_constraint(
        'fk_periods_term_id', 'evaluation_periods', type_='foreignkey',
    )
    op.drop_column('evaluation_periods', 'term_id')
    op.drop_constraint(
        'uq_weightings_term_id', 'evaluation_weightings', type_='unique',
    )
    op.drop_constraint(
        'fk_weightings_term_id', 'evaluation_weightings', type_='foreignkey',
    )
    op.drop_column('evaluation_weightings', 'term_id')
    op.drop_table('school_terms')
