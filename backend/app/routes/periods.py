from datetime import date

from flask import Blueprint, request, jsonify
from flask_login import login_required

from ..extensions import db
from ..models.evaluation_period import EvaluationPeriod
from ..models.evaluation_type import EvaluationType
from ..models.user import User
from ..models.student import Student
from ..services.notification_service import (
    notify_user,
    notify_student,
)
from ..utils.decorators import roles_required


periods_bp = Blueprint("periods", __name__)


@periods_bp.route("/current", methods=["GET"])
@login_required
def get_current_period():
    period = EvaluationPeriod.query.order_by(EvaluationPeriod.id.desc()).first()

    if not period:
        return jsonify(None), 200

    return jsonify(period.to_dict()), 200


@periods_bp.route("/current", methods=["PUT"])
@roles_required("admin")
def set_current_period():
    data = request.get_json(silent=True) or {}

    start_date = data.get("start_date")
    end_date = data.get("end_date")
    applies_to_code = data.get("applies_to_type", "student")

    if not start_date or not end_date:
        return jsonify({
            "error": "start_date and end_date are required (YYYY-MM-DD)"
        }), 400

    try:
        start = date.fromisoformat(start_date)
        end = date.fromisoformat(end_date)
    except ValueError:
        return jsonify({
            "error": "Dates must be in YYYY-MM-DD format"
        }), 400

    if end < start:
        return jsonify({
            "error": "end_date cannot be before start_date"
        }), 400

    evaluation_type = EvaluationType.query.filter_by(
        code=applies_to_code
    ).first()

    if not evaluation_type:
        return jsonify({
            "error": f"Unknown evaluation type '{applies_to_code}'"
        }), 404

    period = EvaluationPeriod(
        start_date=start,
        end_date=end,
        applies_to_type_id=evaluation_type.id
    )

    db.session.add(period)

    # ---------------------------------------------------------
    # NOTIFICATIONS
    # ---------------------------------------------------------

    if applies_to_code == "student":
        # Students need to know that their evaluation period is open.
        students = Student.query.all()

        for student in students:
            notify_student(
                student.id,
                "Student evaluation period is now open."
            )

        # Faculty should also know that the student evaluation
        # period has started.
        faculty_users = User.query.filter_by(
            role="faculty",
            status="active"
        ).all()

        for faculty in faculty_users:
            notify_user(
                faculty.id,
                "Student evaluation period is now open."
            )

    elif applies_to_code == "classroomObservation":
        # Faculty need to know when classroom observation
        # evaluation is active.
        faculty_users = User.query.filter_by(
            role="faculty",
            status="active"
        ).all()

        for faculty in faculty_users:
            notify_user(
                faculty.id,
                "Classroom observation evaluation period is now open."
            )

    elif applies_to_code == "peerToPeer":
        # Faculty need to know when peer evaluation is active.
        faculty_users = User.query.filter_by(
            role="faculty",
            status="active"
        ).all()

        for faculty in faculty_users:
            notify_user(
                faculty.id,
                "Peer-to-peer evaluation period is now open."
            )

    elif applies_to_code == "hrEvaluation":
        # HR and Admin are informed when the HR evaluation period opens.
        staff_users = User.query.filter(
            User.role.in_(["admin", "hr"]),
            User.status == "active"
        ).all()

        for user in staff_users:
            notify_user(
                user.id,
                "HR evaluation period is now open."
            )

    # Commit the evaluation period and its notifications together.
    db.session.commit()

    return jsonify(period.to_dict()), 201