from flask import Blueprint, request, jsonify

from ..extensions import db
from ..models.user import User
from ..models.faculty import Faculty
from ..utils.decorators import roles_required
from flask_login import current_user
from ..services.activity_service import log_activity

accounts_bp = Blueprint("accounts", __name__)

VALID_ROLES = {"admin", "hr", "faculty"}



@accounts_bp.route("", methods=["GET"])
@roles_required("admin")
def list_accounts():
    users = User.query.order_by(User.name).all()
    return jsonify([u.to_dict() for u in users]), 200


@accounts_bp.route("", methods=["POST"])
@roles_required("admin")
def create_account():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    name = (data.get("name") or "").strip()
    role = data.get("role")
    faculty_id = data.get("faculty_id")

    if not username or not password or not name:
        return jsonify({"error": "username, password, and name are required"}), 400
    if role not in VALID_ROLES:
        return jsonify({"error": f"role must be one of {sorted(VALID_ROLES)}"}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "That username is already taken"}), 409

    linked_faculty = None
    if role == "faculty" and faculty_id is not None:
        linked_faculty = Faculty.query.get(faculty_id)
        if not linked_faculty:
            return jsonify({"error": "No faculty roster entry with that id"}), 404
        if linked_faculty.user_id is not None:
            return jsonify({"error": "That faculty roster entry already has a linked account"}), 409

    user = User(
        username=username,
        name=name,
        role=role,
        email=data.get("email"),
        phone=data.get("phone"),
        status="active",
    )
    user.set_password(password)
    db.session.add(user)
    db.session.flush()

    if linked_faculty:
        linked_faculty.user_id = user.id

    db.session.commit()

    log_activity(
        f"Created account: {user.name} ({user.username})",
        user_id=current_user.id
    )

    return jsonify(user.to_dict()), 201

changes = []

@accounts_bp.route("/<int:user_id>", methods=["PUT"])
@roles_required("admin")
def update_account(user_id):
    user = User.query.get_or_404(user_id)
    data = request.get_json(silent=True) or {}

    if "username" in data:
        username = (data.get("username") or "").strip()

        if not username:
            return jsonify({"error": "username is required"}), 400

        existing = User.query.filter(
            User.username == username,
            User.id != user.id
        ).first()

        if existing:
            return jsonify({
                "error": "That username is already taken"
            }), 409

        if user.username != username:
            changes.append("username")

        user.username = username

    if "name" in data:
        name = (data.get("name") or "").strip()

        if not name:
            return jsonify({"error": "name is required"}), 400

        if user.name != name:
            changes.append("name")

        user.name = name

    if "role" in data:
        if data["role"] not in VALID_ROLES:
            return jsonify({
                "error": f"role must be one of {sorted(VALID_ROLES)}"
            }), 400

        
        if user.role != data["role"]:
            changes.append("role")

        user.role = data["role"]

    if "email" in data:
        user.email = data["email"]

    if "phone" in data:
        user.phone = data["phone"]

    if "status" in data:
        if data["status"] not in ("active", "inactive"):
            return jsonify({
                "error": "status must be 'active' or 'inactive'"
            }), 400

        if user.status != data["status"]:
            changes.append(
                f"status to {data['status']}"
            )

        user.status = data["status"]

    if "password" in data and data["password"]:
        user.set_password(data["password"])
        changes.append("password")

    db.session.commit()

    if changes:
        log_activity(
            f"Updated account: {user.name} ({', '.join(changes)})",
            user_id=current_user.id
        )

    return jsonify(user.to_dict()), 200