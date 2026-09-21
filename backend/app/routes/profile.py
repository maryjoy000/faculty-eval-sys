from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from ..extensions import db
from ..utils.decorators import get_current_role
from ..services.activity_service import log_activity

profile_bp = Blueprint("profile", __name__)


@profile_bp.route("", methods=["GET"])
@login_required
def get_profile():
    role = get_current_role()

    if role == "student":
        advisory = current_user.advisory_assignment

        return jsonify({
            "name": current_user.name,
            "email": current_user.email,
            "phone": current_user.phone,
            "role": "student",
            "lrn": current_user.lrn,
            "grade": advisory.grade_level if advisory else None,
            "section": advisory.section_name if advisory else None,
        }), 200

    return jsonify({
        "name": current_user.name,
        "email": current_user.email,
        "phone": current_user.phone,
        "two_factor_enabled": current_user.two_factor_enabled,
        "role": role,
    }), 200


@profile_bp.route("", methods=["PUT"])
@login_required
def update_profile():
    role = get_current_role()

    if role == "student":
        return jsonify({"error": "Students cannot edit their profile"}), 403

    data = request.get_json(silent=True) or {}

    if "name" in data:
        name = (data.get("name") or "").strip()

        if not name:
            return jsonify({"error": "Name cannot be empty"}), 400

        current_user.name = name

    if "email" in data:
        current_user.email = data["email"]

    if "phone" in data:
        current_user.phone = data["phone"]

    # NOTE: two_factor_enabled is intentionally NOT writable here — it can
    # only change through the /api/2fa enrollment/verification endpoints,
    # which guarantee a TOTP secret exists before the flag flips on.

    if "password" in data and data["password"]:
        current_password = data.get("current_password") or ""

        if not current_user.check_password(current_password):
            return jsonify({"error": "Current password is incorrect"}), 400

        current_user.set_password(data["password"])
        log_activity("Changed password", user_id=current_user.id)

    db.session.commit()

    log_activity("Updated profile", user_id=current_user.id)

    return jsonify({
        "name": current_user.name,
        "email": current_user.email,
        "phone": current_user.phone,
        "two_factor_enabled": current_user.two_factor_enabled,
        "role": role,
    }), 200