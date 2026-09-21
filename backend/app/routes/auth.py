from flask import Blueprint, request, jsonify, session
from flask_login import login_user, logout_user, login_required, current_user

from ..extensions import db
from ..models.user import User
from ..models.student import Student
from ..utils.decorators import get_current_role
from ..services.activity_service import log_activity

auth_bp = Blueprint("auth", __name__)

PENDING_2FA_SESSION_KEY = "pending_2fa"


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    user = User.query.filter_by(username=username).first()
    if user and user.status == "active" and user.check_password(password):
        if user.two_factor_enabled:
            # Password OK but a second factor is still required. Do NOT
            # log the user in yet — /me stays 401 until /2fa/verify-login.
            session[PENDING_2FA_SESSION_KEY] = user.get_id()
            return jsonify({"two_factor_required": True}), 202
        if user.role == "admin":
            # Admins must enroll in 2FA before a full login is granted.
            session[PENDING_2FA_SESSION_KEY] = user.get_id()
            return jsonify({"two_factor_setup_required": True}), 202
        login_user(user)
        session.pop(PENDING_2FA_SESSION_KEY, None)
        log_activity("Logged in", user_id=user.id)
        db.session.commit()
        return jsonify({"id": user.id, "username": user.username, "name": user.name, "role": user.role}), 200

    student = Student.query.filter_by(lrn=username).first()
    if student and student.check_password(password):
        login_user(student)
        session.pop(PENDING_2FA_SESSION_KEY, None)
        log_activity("Logged in", student_id=student.id)
        db.session.commit()
        return jsonify({"id": student.id, "username": student.lrn, "name": student.name, "role": "student"}), 200

    return jsonify({"error": "Invalid username or password"}), 401


@auth_bp.route("/logout", methods=["POST"])
@login_required
def logout():
    role = get_current_role()
    if role == "student":
        log_activity("Logged out", student_id=current_user.id)
    else:
        log_activity("Logged out", user_id=current_user.id)

    logout_user()
    session.pop(PENDING_2FA_SESSION_KEY, None)
    db.session.commit()
    return jsonify({"message": "Logged out"}), 200


@auth_bp.route("/me", methods=["GET"])
@login_required
def me():
    role = get_current_role()
    identity = current_user._get_current_object()

    if role == "student":
        return jsonify({
            "id": identity.id,
            "username": identity.lrn,
            "name": identity.name,
            "role": "student"
        }), 200

    response = {
        "id": identity.id,
        "username": identity.username,
        "name": identity.name,
        "role": identity.role,
    }

    if role == "faculty":
        faculty = identity.faculty_profile

        response["linked_faculty_id"] = (
            faculty.id if faculty else None
        )

    return jsonify(response), 200