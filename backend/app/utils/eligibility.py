"""
Centralizes "who can evaluate whom, and have they already" — this logic
was scattered across 4 different page files in the old frontend
(select-colleague.js, select-faculty.js, evaluation.js, hr-evaluation.js).
Server-side, it should only live here, not duplicated per route.
"""
from datetime import date

from flask_login import current_user

from ..models.evaluation import Evaluation
from ..models.evaluation_period import EvaluationPeriod
from ..models.faculty import Faculty
from ..models.evaluation_type import EvaluationType

ROLE_TO_TYPE = {
    "student": "student",
    "faculty": "peerToPeer",
    "hr": "hrEvaluation",
    "admin": "classroomObservation",
}


def resolve_evaluator(role, evaluation_type_code):
    if ROLE_TO_TYPE.get(role) != evaluation_type_code:
        return None, ({"error": f"Role '{role}' cannot submit '{evaluation_type_code}' evaluations"}, 403)

    if role == "student":
        return {"student_id": current_user.id}, None

    if role == "faculty":
        faculty = Faculty.query.filter_by(user_id=current_user.id).first()
        if not faculty:
            return None, ({"error": "This account is not linked to a faculty roster entry yet"}, 409)
        return {"faculty_id": faculty.id}, None

    return {"user_id": current_user.id}, None


def check_self_evaluation(evaluation_type_code, evaluator, faculty_id):
    """Per Joy's decision: faculty can never evaluate themselves."""
    if evaluation_type_code == "peerToPeer" and evaluator.get("faculty_id") == faculty_id:
        return ({"error": "You cannot evaluate yourself"}, 403)
    return None


def check_period_open(evaluation_type_code):
    """Only Student evaluation is currently gated by a period window."""
    if evaluation_type_code != "student":
        return None

    period = EvaluationPeriod.query.order_by(EvaluationPeriod.id.desc()).first()
    if not period or not period.applies_to_type or period.applies_to_type.code != "student":
        return ({"error": "No open evaluation period for students right now"}, 403)

    today = date.today()
    if not (period.start_date <= today <= period.end_date):
        return ({"error": "The student evaluation period is currently closed"}, 403)

    return None


def check_duplicate(evaluation_type_id, faculty_id, evaluator):
    """
    Student and Peer-to-Peer aggregate many evaluators per target faculty
    (scoped to THIS evaluator), while HR and Classroom Observation are
    one-slot-per-faculty (unscoped by evaluator).
    """
    query = Evaluation.query.filter_by(evaluation_type_id=evaluation_type_id, faculty_id=faculty_id)

    if "student_id" in evaluator:
        query = query.filter_by(evaluator_student_id=evaluator["student_id"])
    elif "faculty_id" in evaluator:
        query = query.filter_by(evaluator_faculty_id=evaluator["faculty_id"])

    if query.first():
        return ({"error": "An evaluation already exists for this faculty member"}, 409)
    return None