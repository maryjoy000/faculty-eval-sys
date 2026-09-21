"""replace placeholder HR evaluation questions with the real set

Revision ID: e5a9c1d4f2b7
Revises: d8f3a6b2c9e1
Create Date: 2026-09-22

The HR evaluation shipped with "[Placeholder]" questions. This revision
upgrades an already-seeded database:

- renames the two seeded part titles (only while they are still the
  originals, so manual customizations are never overwritten)
- replaces question text that still carries the [Placeholder] marker
- adds the two new questions (p7, p8) to part 2 when missing

Fresh databases run migrations before seed, so this revision is a no-op
there; seed.py carries the same final question set.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e5a9c1d4f2b7'
down_revision = 'd8f3a6b2c9e1'
branch_labels = None
depends_on = None


UPDATED_TEXT = {
    "p1": "Submits required teaching documents (lesson plans, syllabi, and class records) on or before deadlines.",
    "p2": "Maintains complete and updated instructional materials for all assigned subjects.",
    "p3": "Submits grading records, reports, and other required documents accurately and on time.",
    "p4": "Attends school-organized seminars, trainings, and orientations regularly.",
    "p5": "Applies learnings from trainings and seminars to actual classroom practice.",
    "p6": "Participates actively in professional development opportunities.",
}

OLD_PART_TITLES = {
    1: "Document Submission Completeness",
    2: "Seminars and Trainings Attended",
}

PART_TITLES = {
    1: "Document Submission and Records Management",
    2: "Professional Development and Work Ethics",
}

NEW_QUESTIONS = [
    # (question_code, text, part_number, display_order)
    (
        "p7",
        "Demonstrates punctuality, consistency, and professionalism in performing assigned duties.",
        2,
        3,
    ),
    (
        "p8",
        "Cooperates with colleagues and the administration in school activities and programs.",
        2,
        4,
    ),
]


def upgrade():
    conn = op.get_bind()

    row = conn.execute(
        sa.text("SELECT id FROM evaluation_types WHERE code = 'hrEvaluation'")
    ).fetchone()
    if row is None:
        print("hrEvaluation type not found (fresh database) - skipping")
        return
    type_id = row[0]

    parts = {}
    for part_id, part_number, title in conn.execute(
        sa.text(
            "SELECT id, part_number, title FROM evaluation_criteria "
            "WHERE evaluation_type_id = :type_id"
        ),
        {"type_id": type_id},
    ).fetchall():
        parts[part_number] = {"id": part_id, "title": title}

    # Rename seeded part titles, but never clobber manual customizations.
    for part_number, new_title in PART_TITLES.items():
        part = parts.get(part_number)
        if part and part["title"] == OLD_PART_TITLES.get(part_number):
            conn.execute(
                sa.text(
                    "UPDATE evaluation_criteria SET title = :title WHERE id = :id"
                ),
                {"title": new_title, "id": part["id"]},
            )
            print(f"renamed HR part {part_number}")

    # Replace question text that is still the original placeholder.
    for code, text in UPDATED_TEXT.items():
        result = conn.execute(
            sa.text(
                "UPDATE evaluation_questions SET text = :text "
                "WHERE question_code = :code AND text LIKE '[Placeholder]%'"
            ),
            {"text": text, "code": code},
        )
        if result.rowcount:
            print(f"updated HR question {code}")

    # Add the new questions when they are missing.
    for code, text, part_number, display_order in NEW_QUESTIONS:
        part = parts.get(part_number)
        if part is None:
            continue
        existing = conn.execute(
            sa.text(
                "SELECT q.id FROM evaluation_questions q "
                "JOIN evaluation_criteria c ON c.id = q.criteria_id "
                "WHERE c.evaluation_type_id = :type_id AND q.question_code = :code"
            ),
            {"type_id": type_id, "code": code},
        ).fetchone()
        if existing is None:
            conn.execute(
                sa.text(
                    "INSERT INTO evaluation_questions "
                    "(criteria_id, question_code, text, display_order, is_active) "
                    "VALUES (:criteria_id, :code, :text, :display_order, 1)"
                ),
                {
                    "criteria_id": part["id"],
                    "code": code,
                    "text": text,
                    "display_order": display_order,
                },
            )
            print(f"added HR question {code}")


def downgrade():
    # Data upgrade only; question text is left in place on downgrade so
    # answers already given are never orphaned or reverted confusingly.
    print("downgrade: no-op (data-only revision)")
