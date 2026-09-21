from flask import Blueprint, jsonify
from flask_login import login_required, current_user

from ..extensions import db
from ..models.notification import Notification
from ..utils.decorators import get_current_role

notifications_bp = Blueprint("notifications", __name__)


@notifications_bp.route("", methods=["GET"])
@login_required
def list_notifications():
    role = get_current_role()

    if role == "student":
        notes = (
            Notification.query
            .filter_by(student_id=current_user.id)
            .order_by(Notification.created_at.desc())
            .all()
        )
    else:
        notes = (
            Notification.query
            .filter_by(user_id=current_user.id)
            .order_by(Notification.created_at.desc())
            .all()
        )

    return jsonify([n.to_dict() for n in notes]), 200


@notifications_bp.route("/<int:notification_id>/read", methods=["PUT"])
@login_required
def mark_read(notification_id):
    role = get_current_role()
    note = Notification.query.get_or_404(notification_id)

    if role == "student":
        if note.student_id != current_user.id:
            return jsonify({"error": "Forbidden"}), 403
    else:
        if note.user_id != current_user.id:
            return jsonify({"error": "Forbidden"}), 403

    note.is_read = True
    db.session.commit()

    return jsonify(note.to_dict()), 200


@notifications_bp.route("/read-all", methods=["PUT"])
@login_required
def mark_all_read():
    role = get_current_role()

    if role == "student":
        Notification.query.filter_by(
            student_id=current_user.id,
            is_read=False
        ).update(
            {"is_read": True},
            synchronize_session=False
        )
    else:
        Notification.query.filter_by(
            user_id=current_user.id,
            is_read=False
        ).update(
            {"is_read": True},
            synchronize_session=False
        )

    db.session.commit()

    return jsonify({"message": "All notifications marked as read"}), 200