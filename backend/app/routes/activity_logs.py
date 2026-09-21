from flask import Blueprint, jsonify
from flask_login import login_required, current_user

from ..models.activity_log import ActivityLog
from ..models.user import User
from ..utils.decorators import get_current_role
from flask import Blueprint, jsonify, request

activity_logs_bp = Blueprint("activity_logs", __name__)


@activity_logs_bp.route("", methods=["GET"])
@login_required
def list_activity():
    role = get_current_role()

    if role not in ("admin", "hr"):
        return jsonify([]), 200

    logs = (
        ActivityLog.query
        .order_by(ActivityLog.created_at.desc())
        .limit(20)
        .all()
    )

    return jsonify([log.to_dict() for log in logs]), 200

@activity_logs_bp.route("/mine", methods=["GET"])
@login_required
def list_my_activity():
    role = get_current_role()

    if role == "student":
        logs = ActivityLog.query.filter_by(
            student_id=current_user.id
        )
    else:
        logs = ActivityLog.query.filter_by(
            user_id=current_user.id
        )

    logs = (
        logs
        .order_by(ActivityLog.created_at.desc())
        .limit(20)
        .all()
    )

    return jsonify([log.to_dict() for log in logs]), 200

@activity_logs_bp.route("", methods=["POST"])
@login_required
def create_activity():
    data = request.get_json(silent=True) or {}
    description = (data.get("description") or "").strip()

    if not description:
        return jsonify({"error": "description is required"}), 400

    role = get_current_role()

    if role == "student":
        log = ActivityLog(
            student_id=current_user.id,
            description=description
        )
    else:
        log = ActivityLog(
            user_id=current_user.id,
            description=description
        )

    from ..extensions import db

    db.session.add(log)
    db.session.commit()

    return jsonify(log.to_dict()), 201