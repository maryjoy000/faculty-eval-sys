from flask import Blueprint, request, jsonify
from flask_login import current_user

from ..extensions import db
from ..models.advisory import AdvisoryAssignment
from ..models.evaluation import Evaluation
from ..models.faculty import Faculty
from ..models.section import Section
from ..models.student import Student
from ..utils.decorators import roles_required
from ..services.activity_service import log_activity

sections_bp = Blueprint("sections", __name__)
students_bp = Blueprint("students", __name__)


def _section_label(grade_level, section_name):
    return f"{grade_level} {section_name}"


def _get_or_create_section(grade_level, section_name):
    """Find the master section, creating it (active) when missing."""
    section = Section.query.filter_by(
        grade_level=grade_level,
        section_name=section_name,
    ).first()

    if section is None:
        section = Section(
            grade_level=grade_level,
            section_name=section_name,
            is_active=True,
        )
        db.session.add(section)
        db.session.flush()

    return section


def _get_or_create_slot(grade_level, section_name):
    """Find the advisory slot for a section, creating it unassigned."""
    assignment = AdvisoryAssignment.query.filter_by(
        grade_level=grade_level,
        section_name=section_name,
    ).first()

    if assignment is None:
        section = _get_or_create_section(grade_level, section_name)
        assignment = AdvisoryAssignment(
            faculty_id=None,
            grade_level=grade_level,
            section_name=section_name,
            section_id=section.id,
        )
        db.session.add(assignment)
        db.session.flush()
    elif assignment.section_id is None:
        section = _get_or_create_section(grade_level, section_name)
        assignment.section_id = section.id

    return assignment


def _section_payload(section):
    data = section.to_dict()

    linked = AdvisoryAssignment.query.filter_by(section_id=section.id).all()
    data["student_count"] = sum(len(a.students) for a in linked)

    adviser_names = sorted({
        a.faculty.name
        for a in linked
        if a.faculty is not None and a.faculty.name
    })
    data["adviser_name"] = adviser_names[0] if adviser_names else None

    return data


def _student_master_row(student):
    data = student.to_dict()
    assignment = student.advisory_assignment

    data["grade_level"] = assignment.grade_level if assignment else None
    data["section_name"] = assignment.section_name if assignment else None
    data["section_id"] = assignment.section_id if assignment else None
    data["adviser_name"] = (
        assignment.faculty.name
        if assignment and assignment.faculty
        else None
    )

    return data


def _valid_lrn(lrn):
    return isinstance(lrn, str) and len(lrn) == 12 and lrn.isdigit()


# ============================================
# SECTIONS (Enrollment Master List)
# ============================================

@sections_bp.route("", methods=["GET"])
@roles_required("admin", "hr", "faculty")
def list_sections():
    query = Section.query

    status = (request.args.get("status") or "all").strip().lower()
    if status == "active":
        query = query.filter_by(is_active=True)
    elif status == "inactive":
        query = query.filter_by(is_active=False)

    grade = (request.args.get("grade_level") or "").strip()
    if grade:
        query = query.filter(Section.grade_level == grade)

    q = (request.args.get("q") or "").strip()
    if q:
        like = f"%{q}%"
        query = query.filter(
            db.or_(
                Section.grade_level.ilike(like),
                Section.section_name.ilike(like),
            )
        )

    sections = query.order_by(
        Section.grade_level, Section.section_name
    ).all()

    return jsonify([_section_payload(s) for s in sections]), 200


@sections_bp.route("", methods=["POST"])
@roles_required("admin")
def create_section():
    data = request.get_json(silent=True) or {}

    grade_level = (data.get("grade_level") or "").strip()
    section_name = (data.get("section_name") or "").strip()
    school_year = (data.get("school_year") or "").strip() or None

    if not grade_level or not section_name:
        return jsonify({
            "error": "grade_level and section_name are required"
        }), 400

    existing = Section.query.filter_by(
        grade_level=grade_level,
        section_name=section_name,
    ).first()

    if existing:
        return jsonify({
            "error": f"Section {_section_label(grade_level, section_name)} already exists."
        }), 409

    section = Section(
        grade_level=grade_level,
        section_name=section_name,
        school_year=school_year,
        is_active=data.get("is_active", True),
    )
    db.session.add(section)
    db.session.commit()

    log_activity(
        f"Added enrollment section {_section_label(grade_level, section_name)}",
        user_id=current_user.id,
    )

    return jsonify(_section_payload(section)), 201


@sections_bp.route("/bulk", methods=["POST"])
@roles_required("admin")
def bulk_upsert_sections():
    data = request.get_json(silent=True) or {}
    rows = data.get("sections")

    if not isinstance(rows, list) or not rows:
        return jsonify({"error": "sections must be a non-empty list"}), 400

    created = 0
    updated = 0
    errors = []

    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            errors.append({"index": index, "error": "Row must be an object"})
            continue

        grade_level = (row.get("grade_level") or "").strip()
        section_name = (row.get("section_name") or "").strip()

        if not grade_level or not section_name:
            errors.append({
                "index": index,
                "error": "grade_level and section_name are required",
            })
            continue

        section = Section.query.filter_by(
            grade_level=grade_level,
            section_name=section_name,
        ).first()

        if section is None:
            section = Section(
                grade_level=grade_level,
                section_name=section_name,
                school_year=(row.get("school_year") or "").strip() or None,
                is_active=row.get("is_active", True),
            )
            db.session.add(section)
            created += 1
        else:
            if "school_year" in row:
                section.school_year = (row.get("school_year") or "").strip() or None
            if "is_active" in row:
                section.is_active = bool(row.get("is_active"))
            updated += 1

    db.session.commit()

    log_activity(
        f"Imported enrollment sections: {created} created, {updated} updated, "
        f"{len(errors)} errors",
        user_id=current_user.id,
    )

    return jsonify({
        "created": created,
        "updated": updated,
        "errors": errors,
    }), 200


@sections_bp.route("/<int:section_id>", methods=["PUT"])
@roles_required("admin")
def update_section(section_id):
    section = Section.query.get_or_404(section_id)
    data = request.get_json(silent=True) or {}

    new_grade = (data.get("grade_level") or section.grade_level).strip()
    new_name = (data.get("section_name") or section.section_name).strip()

    if not new_grade or not new_name:
        return jsonify({
            "error": "grade_level and section_name cannot be empty"
        }), 400

    clash = Section.query.filter(
        Section.grade_level == new_grade,
        Section.section_name == new_name,
        Section.id != section.id,
    ).first()

    if clash:
        return jsonify({
            "error": f"Section {_section_label(new_grade, new_name)} already exists."
        }), 409

    renamed = (
        new_grade != section.grade_level or new_name != section.section_name
    )

    section.grade_level = new_grade
    section.section_name = new_name

    if "school_year" in data:
        section.school_year = (data.get("school_year") or "").strip() or None

    if "is_active" in data:
        section.is_active = bool(data.get("is_active"))

    if renamed:
        # Linked advisories describe the same class — keep them in sync.
        AdvisoryAssignment.query.filter_by(section_id=section.id).update({
            "grade_level": new_grade,
            "section_name": new_name,
        })

    db.session.commit()

    log_activity(
        f"Updated enrollment section {_section_label(new_grade, new_name)}",
        user_id=current_user.id,
    )

    return jsonify(_section_payload(section)), 200


@sections_bp.route("/<int:section_id>", methods=["DELETE"])
@roles_required("admin")
def delete_section(section_id):
    section = Section.query.get_or_404(section_id)

    linked_count = AdvisoryAssignment.query.filter_by(
        section_id=section.id
    ).count()

    if linked_count:
        return jsonify({
            "error": (
                f"Cannot delete {_section_label(section.grade_level, section.section_name)} "
                f"while {linked_count} advisory assignment(s) use it. "
                "Deactivate it instead."
            )
        }), 409

    label = _section_label(section.grade_level, section.section_name)
    db.session.delete(section)
    db.session.commit()

    log_activity(
        f"Deleted enrollment section {label}",
        user_id=current_user.id,
    )

    return jsonify({"message": "Section deleted"}), 200


# ============================================
# STUDENTS (Enrollment Master List)
# ============================================

@students_bp.route("", methods=["GET"])
@roles_required("admin", "hr")
def list_students():
    query = Student.query.outerjoin(
        AdvisoryAssignment,
        Student.advisory_assignment_id == AdvisoryAssignment.id,
    )

    verified = (request.args.get("verified") or "all").strip().lower()
    if verified == "true":
        query = query.filter(Student.verification_status == "verified")
    elif verified == "false":
        query = query.filter(Student.verification_status == "unverified")

    assigned = (request.args.get("assigned") or "all").strip().lower()
    if assigned == "true":
        query = query.filter(Student.advisory_assignment_id.isnot(None))
    elif assigned == "false":
        query = query.filter(Student.advisory_assignment_id.is_(None))

    grade = (request.args.get("grade_level") or "").strip()
    if grade:
        query = query.filter(AdvisoryAssignment.grade_level == grade)

    section_name = (request.args.get("section_name") or "").strip()
    if section_name:
        query = query.filter(AdvisoryAssignment.section_name == section_name)

    q = (request.args.get("q") or "").strip()
    if q:
        like = f"%{q}%"
        query = query.filter(
            db.or_(
                Student.lrn.ilike(like),
                Student.last_name.ilike(like),
                Student.first_name.ilike(like),
                Student.name.ilike(like),
            )
        )

    students = query.order_by(Student.last_name, Student.first_name).all()

    return jsonify([_student_master_row(s) for s in students]), 200


@students_bp.route("/bulk", methods=["POST"])
@roles_required("admin")
def bulk_upsert_students():
    data = request.get_json(silent=True) or {}
    rows = data.get("students")

    if not isinstance(rows, list) or not rows:
        return jsonify({"error": "students must be a non-empty list"}), 400

    created = 0
    updated = 0
    placed = 0
    errors = []

    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            errors.append({"index": index, "error": "Row must be an object"})
            continue

        lrn = (row.get("lrn") or "").strip()
        last_name = (row.get("last_name") or "").strip()
        first_name = (row.get("first_name") or "").strip()
        middle_name = (row.get("middle_name") or "").strip() or None

        if not _valid_lrn(lrn):
            errors.append({
                "index": index,
                "lrn": lrn,
                "error": "lrn must be exactly 12 digits",
            })
            continue

        if not last_name or not first_name:
            errors.append({
                "index": index,
                "lrn": lrn,
                "error": "last_name and first_name are required",
            })
            continue

        name = (
            f"{last_name}, {first_name} {middle_name}"
            if middle_name
            else f"{last_name}, {first_name}"
        )

        student = Student.query.filter_by(lrn=lrn).first()

        if student is None:
            student = Student(
                lrn=lrn,
                last_name=last_name,
                first_name=first_name,
                middle_name=middle_name,
                name=name,
                advisory_assignment_id=None,
                verification_status="verified",
            )
            db.session.add(student)
            created += 1
        else:
            student.last_name = last_name
            student.first_name = first_name
            student.middle_name = middle_name
            student.name = name
            student.verification_status = "verified"
            updated += 1

        grade_level = (row.get("grade_level") or "").strip() or None
        section_name = (row.get("section_name") or "").strip() or None

        if grade_level and section_name:
            assignment = _get_or_create_slot(grade_level, section_name)

            if student.advisory_assignment_id != assignment.id:
                student.advisory_assignment_id = assignment.id
                placed += 1
        elif grade_level or section_name:
            errors.append({
                "index": index,
                "lrn": lrn,
                "error": "grade_level and section_name are required together for placement",
            })
            continue

    db.session.commit()

    log_activity(
        f"Imported enrollment: {created} students created, {updated} updated, "
        f"{placed} placed, {len(errors)} errors",
        user_id=current_user.id,
    )

    return jsonify({
        "created": created,
        "updated": updated,
        "placed": placed,
        "errors": errors,
    }), 200


@students_bp.route("/<int:student_id>", methods=["PUT"])
@roles_required("admin")
def update_student(student_id):
    student = Student.query.get_or_404(student_id)
    data = request.get_json(silent=True) or {}

    if "last_name" in data or "first_name" in data or "middle_name" in data:
        last_name = (
            (data.get("last_name") or "").strip()
            if "last_name" in data else student.last_name
        )
        first_name = (
            (data.get("first_name") or "").strip()
            if "first_name" in data else student.first_name
        )
        middle_name = (
            (data.get("middle_name") or "").strip() or None
            if "middle_name" in data else student.middle_name
        )

        if not last_name or not first_name:
            return jsonify({
                "error": "last_name and first_name cannot be empty"
            }), 400

        student.last_name = last_name
        student.first_name = first_name
        student.middle_name = middle_name
        student.name = (
            f"{last_name}, {first_name} {middle_name}"
            if middle_name
            else f"{last_name}, {first_name}"
        )

    if "verification_status" in data:
        status = (data.get("verification_status") or "").strip().lower()

        if status not in ("verified", "unverified"):
            return jsonify({
                "error": "verification_status must be 'verified' or 'unverified'"
            }), 400

        student.verification_status = status

    if "advisory_assignment_id" in data:
        assignment_id = data.get("advisory_assignment_id")

        if assignment_id is None:
            student.advisory_assignment_id = None
        else:
            assignment = AdvisoryAssignment.query.get(assignment_id)

            if not assignment:
                return jsonify({"error": "Advisory assignment not found"}), 404

            student.advisory_assignment_id = assignment.id

    db.session.commit()

    log_activity(
        f"Updated enrolled student {student.name} ({student.lrn})",
        user_id=current_user.id,
    )

    return jsonify(_student_master_row(student)), 200


@students_bp.route("/<int:student_id>", methods=["DELETE"])
@roles_required("admin")
def delete_student(student_id):
    student = Student.query.get_or_404(student_id)

    has_evaluations = (
        Evaluation.query
        .filter_by(evaluator_student_id=student.id)
        .first()
        is not None
    )

    if has_evaluations:
        return jsonify({
            "error": (
                f"Cannot delete {student.name} ({student.lrn}) because "
                "submitted evaluations reference this record."
            )
        }), 409

    label = f"{student.name} ({student.lrn})"
    db.session.delete(student)
    db.session.commit()

    log_activity(
        f"Deleted enrolled student {label}",
        user_id=current_user.id,
    )

    return jsonify({"message": "Student deleted"}), 200
