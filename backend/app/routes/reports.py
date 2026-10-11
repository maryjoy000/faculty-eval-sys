from flask import Blueprint, jsonify
from flask_login import current_user

from ..models.faculty import Faculty
from ..models.faculty_report import FacultyReport
from ..utils.decorators import roles_required, get_current_role

reports_bp = Blueprint("reports", __name__)

# The "release report to faculty" feature was removed: faculty now see the
# current open term's results directly. The /release route is gone. The
# read-only /status route below is kept only so any old caller does not 404;
# it can be deleted once nothing uses it.


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