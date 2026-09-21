from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from ..extensions import db
from ..models.faculty import Faculty, FacultySubject, FacultySection
from ..models.user import User
from ..utils.decorators import roles_required, get_current_role
from ..services.activity_service import log_activity

faculty_bp = Blueprint("faculty", __name__)


@faculty_bp.route("", methods=["GET"])
@login_required
def list_faculty():
    faculty = Faculty.query.order_by(Faculty.name).all()
    return jsonify([f.to_dict() for f in faculty]), 200


@faculty_bp.route("/<int:faculty_id>", methods=["GET"])
@login_required
def get_faculty(faculty_id):
    faculty = Faculty.query.get_or_404(faculty_id)
    return jsonify(faculty.to_dict()), 200


@faculty_bp.route("", methods=["POST"])
@roles_required("admin")
def create_faculty():
    data = request.get_json(silent=True) or {}
    first_name = (data.get("first_name") or "").strip()
    middle_initial = (data.get("middle_initial") or "").strip()
    last_name = (data.get("last_name") or "").strip()

    if not first_name or not last_name:
        return jsonify({"error": "First name and last name are required"}), 400

    # Build display name.
    name_parts = [first_name]

    if middle_initial:
        name_parts.append(middle_initial)

    name_parts.append(last_name)

    name = " ".join(name_parts)

    # Username: faculty-firstname, with spaces removed.
    username_base = first_name.replace(" ", "").lower()
    base_username = f"faculty-{username_base}"

    username = base_username
    counter = 2

    while User.query.filter_by(username=username).first():
        username = f"{base_username}{counter}"
        counter += 1

    # Default password: entire last name, spaces removed + 000.
    default_password = f"{last_name.replace(' ', '').lower()}000"
    # Create the login account.
    user = User(
        username=username,
        role="faculty",
        status="active",
        name=name,
    )
    user.set_password(default_password)

    db.session.add(user)
    db.session.flush()

    # Create the faculty profile and link it to the User account.
    faculty = Faculty(
        name=name,
        status=data.get("status", "Active"),
        user_id=user.id,
    )

    db.session.add(faculty)
    db.session.flush()

    _sync_subjects_and_sections(faculty, data)

    db.session.commit()

    log_activity(
        f"Added new faculty: {faculty.name}",
        user_id=current_user.id
    )

    result = faculty.to_dict()
    result["username"] = username
    result["default_password"] = default_password

    return jsonify(result), 201


@faculty_bp.route("/<int:faculty_id>", methods=["PUT"])
@roles_required("admin", "hr")
def update_faculty(faculty_id):
    """
    Admin: full edit (name, status, subjects, sections).
    HR: can archive/restore (status) and edit subjects/sections, but
    cannot rename a faculty member.
    """
    faculty = Faculty.query.get_or_404(faculty_id)
    data = request.get_json(silent=True) or {}
    role = get_current_role()

    if "name" in data and role != "admin":
        return jsonify({"error": "Only Admin can rename a faculty member"}), 403

    status_change_note = None
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "Name cannot be empty"}), 400
        faculty.name = name

    if "status" in data and data["status"] != faculty.status:
        status_change_note = f"{'Restored' if data['status'] == 'Active' else 'Archived'} faculty: {faculty.name}"
        faculty.status = data["status"]

    if "subjects" in data or "sections" in data:
        _sync_subjects_and_sections(faculty, data)

    db.session.commit()

    log_activity(status_change_note or f"Updated faculty: {faculty.name}", user_id=current_user.id)
    return jsonify(faculty.to_dict()), 200


def _sync_subjects_and_sections(faculty, data):
    if "subjects" in data:
        FacultySubject.query.filter_by(faculty_id=faculty.id).delete()
        for subj in data["subjects"]:
            db.session.add(FacultySubject(
                faculty_id=faculty.id,
                subject_code=subj.get("code", ""),
                subject_name=subj.get("name", ""),
            ))

    if "sections" in data:
        FacultySection.query.filter_by(faculty_id=faculty.id).delete()

        for section in data["sections"]:
            db.session.add(FacultySection(
                faculty_id=faculty.id,
                grade_level=section.get("grade_level", "11"),
                section_name=section.get("name", "")
            ))