from flask import Blueprint, request, jsonify
from flask_login import login_user, logout_user, login_required, current_user

from ..models.user import User
from ..models.student import Student
from ..utils.decorators import get_current_role
from ..services.activity_service import log_activity

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    user = User.query.filter_by(username=username).first()
    if user and user.status == "active" and user.check_password(password):
        login_user(user)
        log_activity("Logged in", user_id=user.id)
        return jsonify({"id": user.id, "username": user.username, "name": user.name, "role": user.role}), 200

    student = Student.query.filter_by(lrn=username).first()
    if student and student.check_password(password):
        login_user(student)
        log_activity("Logged in", student_id=student.id)
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