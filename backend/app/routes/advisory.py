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


@advisory_bp.route("/lookup-student", methods=["GET"])
@roles_required("faculty")
def lookup_student():
    """Name preview for the advisory placement form.

    Faculty type an LRN and see the master-list name before assigning —
    no free-typed names, so placement can never create ghost records.
    """
    lrn = (request.args.get("lrn") or "").strip()

    if len(lrn) != 12 or not lrn.isdigit():
        return jsonify({"error": "lrn must be exactly 12 digits"}), 400

    student = Student.query.filter_by(lrn=lrn).first()

    if not student:
        return jsonify({
            "error": (
                "No enrolled student with this LRN. Ask your admin to add "
                "them to the enrollment master list first."
            )
        }), 404

    data = student.to_dict()
    assignment = student.advisory_assignment
    data["assigned_section"] = _label(assignment) if assignment else None

    return jsonify(data), 200


def _label(assignment):
    return f"{assignment.grade_level} {assignment.section_name}"


def _link_master_section(assignment):
    """Link an advisory to its Enrollment Master List section when one
    matches. Keeps the denormalized grade/section strings untouched."""
    from ..models.section import Section

    section = Section.query.filter_by(
        grade_level=assignment.grade_level,
        section_name=assignment.section_name,
    ).first()

    assignment.section_id = section.id if section else None


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

    # Creating from the Enrollment Master List: the section dictates
    # the grade/name so advisories can never drift from the master.
    if data.get("section_id") is not None:
        from ..models.section import Section

        section = Section.query.get(data.get("section_id"))

        if not section:
            return jsonify({"error": "Section not found"}), 404

        grade_level = section.grade_level
        section_name = section.section_name

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
            _link_master_section(existing_assignment)
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
    db.session.flush()
    _link_master_section(assignment)
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

    if not lrn:
        return jsonify({"error": "lrn is required"}), 400

    if len(lrn) != 12 or not lrn.isdigit():
        return jsonify({
            "error": "lrn must be exactly 12 digits"
        }), 400

    # Enrollment Master List validation: faculty place enrolled students,
    # they never create records. Unknown LRNs are rejected so ghost
    # students cannot enter the system (and its evaluations).
    student = Student.query.filter_by(lrn=lrn).first()

    if not student:
        return jsonify({
            "error": (
                "No enrolled student with this LRN. Ask your admin to add "
                "them to the enrollment master list first."
            )
        }), 404

    if student.advisory_assignment_id == assignment.id:
        return jsonify(student.to_dict()), 200

    if student.advisory_assignment_id is not None:
        other = AdvisoryAssignment.query.get(student.advisory_assignment_id)
        other_label = _label(other) if other else "another section"

        return jsonify({
            "error": (
                f"{student.name} is already assigned to {other_label}."
            )
        }), 409

    student.advisory_assignment_id = assignment.id
    db.session.commit()

    log_activity(
        f"Placed student {student.name} ({student.lrn}) to {_label(assignment)}",
        user_id=current_user.id
    )

    return jsonify(student.to_dict()), 200

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

    # Unassign, never delete: the student stays in the Enrollment Master
    # List (and their submitted evaluations stay intact), they simply no
    # longer belong to this section.
    student.advisory_assignment_id = None
    db.session.commit()

    log_activity(f"Removed student {name} from {_label(assignment)} (kept in master list)", user_id=current_user.id)
    return jsonify({"message": "Student removed from section"}), 200