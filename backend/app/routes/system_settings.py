from flask import Blueprint, request, jsonify

from ..extensions import db
from ..models.system_setting import SystemSetting
from ..utils.decorators import roles_required
from flask_login import current_user
from ..services.activity_service import log_activity

system_settings_bp = Blueprint("system_settings", __name__)


def get_settings():
    settings = SystemSetting.query.first()

    if not settings:
        settings = SystemSetting()
        db.session.add(settings)
        db.session.commit()

    return settings


@system_settings_bp.route("", methods=["GET"])
@roles_required("admin", "hr", "faculty", "student")
def get_system_settings():
    return jsonify(get_settings().to_dict()), 200


@system_settings_bp.route("", methods=["PUT"])
@roles_required("admin")
def update_system_settings():
    data = request.get_json(silent=True) or {}

    settings = get_settings()

    changes = []

    if "academic_year" in data:
        academic_year = str(data["academic_year"]).strip()

        if not academic_year:
            return jsonify({"error": "academic_year is required"}), 400

        if settings.academic_year != academic_year:
            changes.append(
                f"academic year from {settings.academic_year} to {academic_year}"
            )
            settings.academic_year = academic_year

    if "semester" in data:
        if data["semester"] not in ("1st", "2nd", "3rd"):
            return jsonify({
                "error": "semester must be 1st, 2nd, or 3rd"
            }), 400

        if settings.semester != data["semester"]:
            changes.append(
                f"semester from {settings.semester} to {data['semester']}"
            )
            settings.semester = data["semester"]

    if "announcement_message" in data:
        new_message = str(
            data["announcement_message"] or ""
        ).strip()

        if settings.announcement_message != new_message:
            changes.append("announcement message")
            settings.announcement_message = new_message

    if "announcement_active" in data:
        new_active = bool(data["announcement_active"])

        if settings.announcement_active != new_active:
            changes.append(
                f"announcement {'enabled' if new_active else 'disabled'}"
            )
            settings.announcement_active = new_active

    if changes:
        db.session.commit()

        log_activity(
            f"Updated system settings: {', '.join(changes)}",
            user_id=current_user.id
        )
    else:
        db.session.commit()

    return jsonify(settings.to_dict()), 200