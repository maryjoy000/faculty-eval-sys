"""evaluations scoped to school terms (Phase 2)

Revision ID: c8e1a5d73f29
Revises: b7d2f9a41c08
Create Date: 2026-09-30

Every evaluation records the School Year/Semester it belongs to:
- New `evaluations.term_id` (nullable FK). Backfilled from the linked
  evaluation period's term; rows with no period (or a pre-terms period)
  keep NULL, which reporting treats as unscoped legacy history.
- New submissions resolve their term as: linked period's term, else the
  single open term, else NULL. Closed terms reject new submissions
  (enforced in the POST route, not here).
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c8e1a5d73f29'
down_revision = 'b7d2f9a41c08'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'evaluations',
        sa.Column('term_id', sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        'fk_evaluations_term_id',
        'evaluations', 'school_terms',
        ['term_id'], ['id'],
    )

    # Backfill from linked periods (which Phase 1 linked to terms).
    op.execute(sa.text(
        "UPDATE evaluations e "
        "JOIN evaluation_periods p ON p.id = e.evaluation_period_id "
        "SET e.term_id = p.term_id "
        "WHERE e.evaluation_period_id IS NOT NULL "
        "AND p.term_id IS NOT NULL"
    ))


def downgrade():
    op.drop_constraint(
        'fk_evaluations_term_id', 'evaluations', type_='foreignkey',
    )
    op.drop_column('evaluations', 'term_id')
