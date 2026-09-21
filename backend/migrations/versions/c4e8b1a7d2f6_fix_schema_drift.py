"""fix schema drift: add model columns that migrations never created

Revision ID: c4e8b1a7d2f6
Revises: a3f1c9e27b4d
Create Date: 2026-09-22

The SQLAlchemy models gained columns that were never captured in a
migration (student names, section grade level, notification student link,
evaluation sentiment). On databases created purely from migrations any
query touching those columns fails with "Unknown column", and student
notifications fail on a NOT NULL user_id.

Development databases were patched by hand, so every change here is
guarded: a column is only added when missing, and nullability is only
altered when the column is still NOT NULL. Safe on both fresh and
already-patched databases.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c4e8b1a7d2f6'
down_revision = 'a3f1c9e27b4d'
branch_labels = None
depends_on = None


def _column_names(table_name):
    inspector = sa.inspect(op.get_bind())
    return {col["name"] for col in inspector.get_columns(table_name)}


def _add_column_if_missing(table_name, column):
    if column.name in _column_names(table_name):
        print(f"skip {table_name}.{column.name} (already exists)")
        return
    op.add_column(table_name, column)
    print(f"added {table_name}.{column.name}")


def _make_nullable_if_needed(table_name, column_name, column_type):
    inspector = sa.inspect(op.get_bind())
    matching = [
        col for col in inspector.get_columns(table_name)
        if col["name"] == column_name
    ]
    if not matching:
        print(f"skip {table_name}.{column_name} (column absent)")
        return
    if matching[0]["nullable"]:
        print(f"skip {table_name}.{column_name} (already nullable)")
        return
    with op.batch_alter_table(table_name) as batch_op:
        batch_op.alter_column(
            column_name, existing_type=column_type, nullable=True
        )
    print(f"{table_name}.{column_name} is now nullable")


def upgrade():
    # student name parts (advisory.py writes these on every add-student)
    _add_column_if_missing(
        'students', sa.Column('last_name', sa.String(length=80), nullable=False)
    )
    _add_column_if_missing(
        'students', sa.Column('first_name', sa.String(length=80), nullable=False)
    )
    _add_column_if_missing(
        'students', sa.Column('middle_name', sa.String(length=80), nullable=True)
    )

    # teaching sections (faculty.py writes grade_level on every section)
    _add_column_if_missing(
        'faculty_sections',
        sa.Column('grade_level', sa.String(length=20), nullable=False),
    )

    # student notifications (notification_service.notify_student)
    _add_column_if_missing(
        'notifications', sa.Column('student_id', sa.Integer(), nullable=True)
    )

    # sentiment analysis results (evaluations.submit_evaluation)
    _add_column_if_missing(
        'evaluations',
        sa.Column('sentiment_label', sa.String(length=20), nullable=True),
    )
    _add_column_if_missing(
        'evaluations', sa.Column('sentiment_score', sa.Float(), nullable=True)
    )

    # student notifications carry user_id = NULL; adviser removal sets
    # advisory_assignments.faculty_id = NULL.
    _make_nullable_if_needed('notifications', 'user_id', sa.Integer())
    _make_nullable_if_needed('advisory_assignments', 'faculty_id', sa.Integer())


def downgrade():
    # Nullability is intentionally left alone (reverting could fail on
    # rows that legitimately hold NULL). Only the added columns are
    # removed to mirror a pre-drift schema.
    for table_name, column_name in (
        ('evaluations', 'sentiment_score'),
        ('evaluations', 'sentiment_label'),
        ('notifications', 'student_id'),
        ('faculty_sections', 'grade_level'),
        ('students', 'middle_name'),
        ('students', 'first_name'),
        ('students', 'last_name'),
    ):
        if column_name in _column_names(table_name):
            op.drop_column(table_name, column_name)
