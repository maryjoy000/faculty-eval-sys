"""enrollment master: sections table, advisory section link, student verification

Revision ID: f3d8b2c47a51
Revises: e5a9c1d4f2b7
Create Date: 2026-09-30

Enrollment Master List foundation:
- New `sections` table: the single source of truth for class sections
  (grade_level + section_name, unique). Backfilled from the distinct
  sections already present in advisory_assignments.
- `advisory_assignments.section_id` (nullable FK): links each advisory
  to its master section. Backfilled by matching grade_level + section_name.
  Grade/section strings are kept untouched so all existing eligibility
  and display logic keeps working byte-for-byte.
- `students.verification_status` ('verified' / 'unverified', NOT NULL,
  defaults to 'unverified'): every pre-existing free-typed student row
  starts as unverified for the admin reconciliation pass; enrollment
  imports mark rows verified.
- `students.advisory_assignment_id` becomes nullable so the master list
  can hold enrolled-but-unplaced students. Placed students are unaffected.

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f3d8b2c47a51'
down_revision = 'e5a9c1d4f2b7'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'sections',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('grade_level', sa.String(length=20), nullable=False),
        sa.Column('section_name', sa.String(length=80), nullable=False),
        sa.Column('school_year', sa.String(length=20), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('grade_level', 'section_name', name='uq_sections_grade_section'),
    )

    # Backfill the master list from sections already in use.
    op.execute(sa.text(
        "INSERT INTO sections (grade_level, section_name, is_active, created_at, updated_at) "
        "SELECT DISTINCT grade_level, section_name, TRUE, NOW(), NOW() "
        "FROM advisory_assignments"
    ))

    op.add_column(
        'advisory_assignments',
        sa.Column('section_id', sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        'fk_advisory_assignments_section_id',
        'advisory_assignments', 'sections',
        ['section_id'], ['id'],
    )

    # Link existing advisories to their master sections.
    op.execute(sa.text(
        "UPDATE advisory_assignments a "
        "JOIN sections s ON s.grade_level = a.grade_level "
        "AND s.section_name = a.section_name "
        "SET a.section_id = s.id"
    ))

    op.add_column(
        'students',
        sa.Column(
            'verification_status',
            sa.Enum('verified', 'unverified', name='student_verification_status'),
            nullable=False,
            server_default='unverified',
        ),
    )

    op.alter_column(
        'students', 'advisory_assignment_id',
        existing_type=sa.Integer(),
        nullable=True,
    )


def downgrade():
    # Restoring NOT NULL requires no unplaced students. Rows that have
    # evaluations are protected by their FK and will surface here instead
    # of being silently destroyed — resolve them before downgrading.
    op.execute(sa.text(
        "DELETE s FROM students s "
        "LEFT JOIN evaluations e ON e.evaluator_student_id = s.id "
        "WHERE s.advisory_assignment_id IS NULL AND e.id IS NULL"
    ))
    op.alter_column(
        'students', 'advisory_assignment_id',
        existing_type=sa.Integer(),
        nullable=False,
    )
    op.drop_column('students', 'verification_status')
    op.drop_constraint(
        'fk_advisory_assignments_section_id',
        'advisory_assignments',
        type_='foreignkey',
    )
    op.drop_column('advisory_assignments', 'section_id')
    op.drop_table('sections')
