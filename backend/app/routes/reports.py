from flask import Blueprint, jsonify
from flask_login import current_user

from ..models.faculty import Faculty
from ..models.faculty_report import FacultyReport
from ..utils.decorators import roles_required, get_current_role
from ..services.report_service import release_report
from ..services.activity_service import log_activity

reports_bp = Blueprint("reports", __name__)


@reports_bp.route("/<int:faculty_id>/release", methods=["POST"])
@roles_required("hr")
def release(faculty_id):
    faculty = Faculty.query.get_or_404(faculty_id)
    report, notified = release_report(faculty, current_user.id)

    log_activity(f"Released report for {faculty.name}", user_id=current_user.id)

    result = report.to_dict()
    result["notified"] = notified
    return jsonify(result), 200


@reports_bp.route("/<int:faculty_id>/status", methods=["GET"])
@roles_required("hr", "admin", "faculty")
def status(faculty_id):
    role = get_current_role()

    if role == "faculty":
        own_faculty = Faculty.query.filter_by(user_id=current_user.id).first()
        if not own_faculty or own_faculty.id != faculty_id:
            return jsonify({"error": "Forbidden"}), 403

    if not Faculty.query.get(faculty_id):
        return jsonify({"error": "No faculty with that id"}), 404

    report = FacultyReport.query.filter_by(faculty_id=faculty_id).first()
    if not report:
        return jsonify({"faculty_id": faculty_id, "status": "unreleased", "released_at": None, "released_by": None, "viewed_at": None}), 200

    return jsonify(report.to_dict()), 200