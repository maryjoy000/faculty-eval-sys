from flask import Blueprint, request, jsonify
from flask_login import current_user

from ..extensions import db
from ..models.advisory import AdvisoryAssignment
from ..models.student import Student
from ..models.faculty import Faculty
from ..utils.decorators import roles_required
from ..services.activity_service import log_activity

advisory_bp = Blueprint("advisory", __name__)


def _current_faculty_or_error():
    faculty = Faculty.query.filter_by(user_id=current_user.id).first()
    if not faculty:
        return None, (jsonify({"error": "This account is not linked to a faculty roster entry yet"}), 409)
    return faculty, None


def _label(assignment):
    return f"{assignment.grade_level} {assignment.section_name}"


@advisory_bp.route("", methods=["GET"])
@roles_required("admin", "hr", "faculty")
def list_own_advisory():
    if current_user.role in ("admin", "hr"):
        assignments = AdvisoryAssignment.query.all()
    else:
        faculty, error = _current_faculty_or_error()
        if error:
            return error

        assignments = AdvisoryAssignment.query.filter_by(
            faculty_id=faculty.id
        ).all()

    return jsonify([
        {
            **a.to_dict(),
            "faculty_id": a.faculty_id,
            "faculty_name": (
                Faculty.query.get(a.faculty_id).name
                if a.faculty_id
                else None
            ),
        }
        for a in assignments
    ]), 200

@advisory_bp.route("", methods=["POST"])
@roles_required("admin", "hr")
def create_advisory():
    data = request.get_json(silent=True) or {}

    faculty_id = data.get("faculty_id")
    grade_level = (data.get("grade_level") or "").strip()
    section_name = (data.get("section_name") or "").strip()

    if not faculty_id or not grade_level or not section_name:
        return jsonify({
            "error": "faculty_id, grade_level, and section_name are required"
        }), 400

    faculty = Faculty.query.get(faculty_id)
    if not faculty:
        return jsonify({"error": "Faculty not found"}), 404

    existing_assignment = AdvisoryAssignment.query.filter_by(
        grade_level=grade_level,
        section_name=section_name
    ).first()

    if existing_assignment:
        # Section already exists but currently has no adviser.
        # Reuse the existing advisory assignment instead of creating a duplicate.
        if existing_assignment.faculty_id is None:
            existing_assignment.faculty_id = faculty.id
            db.session.commit()

            log_activity(
                f"Assigned {faculty.name} as adviser of {_label(existing_assignment)}",
                user_id=current_user.id
            )

            return jsonify({
                **existing_assignment.to_dict(),
                "faculty_id": existing_assignment.faculty_id,
                "faculty_name": faculty.name
            }), 200

        return jsonify({
            "error": "This section already has an adviser."
        }), 409

    assignment = AdvisoryAssignment(
        faculty_id=faculty.id,
        grade_level=grade_level,
        section_name=section_name
    )

    db.session.add(assignment)
    db.session.commit()

    log_activity(
        f"Assigned {faculty.name} as adviser of {_label(assignment)}",
        user_id=current_user.id
    )

    return jsonify(assignment.to_dict()), 201

@advisory_bp.route("/<int:assignment_id>", methods=["PUT"])
@roles_required("admin", "hr", "faculty")
def update_advisory(assignment_id):
    assignment = AdvisoryAssignment.query.get_or_404(assignment_id)

    if current_user.role == "faculty":
        faculty, error = _current_faculty_or_error()
        if error:
            return error

        if assignment.faculty_id != faculty.id:
            return jsonify({"error": "Forbidden"}), 403

    data = request.get_json(silent=True) or {}

    if "faculty_id" in data:
        new_faculty_id = data.get("faculty_id")

        if new_faculty_id is None:
            assignment.faculty_id = None
        else:
            faculty = Faculty.query.get(new_faculty_id)

            if not faculty:
                return jsonify({"error": "Faculty not found"}), 404

            existing = AdvisoryAssignment.query.filter(
                AdvisoryAssignment.id != assignment.id,
                AdvisoryAssignment.grade_level == assignment.grade_level,
                AdvisoryAssignment.section_name == assignment.section_name
            ).first()

            if existing:
                return jsonify({
                    "error": "This section already has another adviser."
                }), 409

            assignment.faculty_id = faculty.id

    if "grade_level" in data:
        assignment.grade_level = data["grade_level"].strip()

    if "section_name" in data:
        assignment.section_name = data["section_name"].strip()

    db.session.commit()

    log_activity(
        f"Updated advisory assignment: {_label(assignment)}",
        user_id=current_user.id
    )

    return jsonify({
        **assignment.to_dict(),
        "faculty_id": assignment.faculty_id,
        "faculty_name": assignment.faculty.name if assignment.faculty else None
    }), 200

@advisory_bp.route("/<int:assignment_id>", methods=["DELETE"])
@roles_required("admin", "hr", "faculty")
def delete_advisory(assignment_id):
    assignment = AdvisoryAssignment.query.get_or_404(assignment_id)

    if current_user.role == "faculty":
        faculty, error = _current_faculty_or_error()
        if error:
            return error

        if assignment.faculty_id != faculty.id:
            return jsonify({"error": "Forbidden"}), 403

    label = _label(assignment)

    # Students belong to the advisory assignment, so they must not
    # be deleted or detached when removing the adviser.
    students = Student.query.filter_by(
        advisory_assignment_id=assignment.id
    ).all()

    if students:
        return jsonify({
            "error": "Cannot remove this advisory assignment while students are assigned to it."
        }), 409

    db.session.delete(assignment)
    db.session.commit()

    log_activity(
        f"Removed adviser from {label}",
        user_id=current_user.id
    )

    return jsonify({"message": "Adviser assignment removed"}), 200


@advisory_bp.route("/<int:assignment_id>/students", methods=["POST"])
@roles_required("faculty")
def add_student(assignment_id):
    faculty, error = _current_faculty_or_error()
    if error:
        return error

    assignment = AdvisoryAssignment.query.get_or_404(assignment_id)

    if assignment.faculty_id != faculty.id:
        return jsonify({"error": "Forbidden"}), 403

    data = request.get_json(silent=True) or {}

    lrn = (data.get("lrn") or "").strip()
    last_name = (data.get("last_name") or "").strip()
    first_name = (data.get("first_name") or "").strip()
    middle_name = (data.get("middle_name") or "").strip()

    if not lrn or not last_name or not first_name:
        return jsonify({
            "error": "lrn, last_name, and first_name are required"
        }), 400

    if len(lrn) != 12 or not lrn.isdigit():
        return jsonify({
            "error": "lrn must be exactly 12 digits"
        }), 400

    if Student.query.filter_by(lrn=lrn).first():
        return jsonify({
            "error": "A student with this LRN already exists"
        }), 409

    name = (
        f"{last_name}, {first_name} {middle_name}"
        if middle_name
        else f"{last_name}, {first_name}"
    )

    student = Student(
        lrn=lrn,
        last_name=last_name,
        first_name=first_name,
        middle_name=middle_name or None,
        name=name,
        advisory_assignment_id=assignment.id
    )

    db.session.add(student)
    db.session.commit()

    log_activity(
        f"Added student {name} to {_label(assignment)}",
        user_id=current_user.id
    )

    return jsonify(student.to_dict()), 201

@advisory_bp.route("/<int:assignment_id>/students/<int:student_id>", methods=["DELETE"])
@roles_required("faculty")
def remove_student(assignment_id, student_id):
    faculty, error = _current_faculty_or_error()
    if error:
        return error

    assignment = AdvisoryAssignment.query.get_or_404(assignment_id)
    if assignment.faculty_id != faculty.id:
        return jsonify({"error": "Forbidden"}), 403

    student = Student.query.get_or_404(student_id)
    if student.advisory_assignment_id != assignment.id:
        return jsonify({"error": "Student does not belong to this section"}), 404

    name = student.name
    db.session.delete(student)
    db.session.commit()

    log_activity(f"Removed student {name} from {_label(assignment)}", user_id=current_user.id)
    return jsonify({"message": "Student removed"}), 200