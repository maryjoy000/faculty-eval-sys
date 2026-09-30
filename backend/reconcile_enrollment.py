"""
Enrollment reconciliation report (READ-ONLY — changes nothing).

Shows, after the enrollment-master migration + first import:
- student totals: verified vs unverified, placed vs unplaced
- sections with student/advisory counts
- near-duplicate section spellings (e.g. "HUMSS A" vs "Humss A") that an
  admin should merge via the Sections manager
- advisories with no master-section link

Usage (from backend/, with the venv active):
    python reconcile_enrollment.py
"""
import os
import re

from app import create_app
from app.extensions import db
from app.models.advisory import AdvisoryAssignment
from app.models.section import Section
from app.models.student import Student


def _normalize_section_label(grade_level, section_name):
    text = f"{grade_level or ''} {section_name or ''}".strip().lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def main():
    app = create_app()
    with app.app_context():
        total = Student.query.count()
        verified = Student.query.filter_by(verification_status="verified").count()
        unverified = total - verified
        unplaced = Student.query.filter(
            Student.advisory_assignment_id.is_(None)
        ).count()

        print("== Students ==")
        print(f"total: {total} | verified: {verified} | "
              f"unverified: {unverified} | unplaced: {unplaced}")

        sections = Section.query.order_by(
            Section.grade_level, Section.section_name
        ).all()
        print(f"\n== Sections ({len(sections)}) ==")

        groups = {}
        for section in sections:
            linked = AdvisoryAssignment.query.filter_by(
                section_id=section.id
            ).all()
            count = sum(len(a.students) for a in linked)
            status = "active" if section.is_active else "inactive"
            print(f"- {section.grade_level} {section.section_name} "
                  f"[{status}]: {count} student(s), "
                  f"{len(linked)} advisorie(s)")

            key = _normalize_section_label(
                section.grade_level, section.section_name
            )
            groups.setdefault(key, []).append(section)

        duplicates = {
            key: items for key, items in groups.items() if len(items) > 1
        }
        print(f"\n== Near-duplicate sections ({len(duplicates)}) ==")
        if not duplicates:
            print("(none — master list is clean)")
        for key, items in sorted(duplicates.items()):
            labels = ", ".join(
                f"'{s.grade_level} {s.section_name}' (id={s.id})"
                for s in items
            )
            print(f"- {labels}  -> keep one, move students, delete the rest")

        unlinked = AdvisoryAssignment.query.filter_by(section_id=None).all()
        print(f"\n== Advisories without master link ({len(unlinked)}) ==")
        for assignment in unlinked[:20]:
            print(f"- {assignment.grade_level} {assignment.section_name} "
                  f"(id={assignment.id})")
        if len(unlinked) > 20:
            print(f"... and {len(unlinked) - 20} more")


if __name__ == "__main__":
    main()
