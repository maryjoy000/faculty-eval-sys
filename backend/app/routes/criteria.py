from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from ..extensions import db
from ..models.evaluation_type import EvaluationType
from ..models.criteria import EvaluationCriteria, EvaluationQuestion
from ..utils.decorators import roles_required
from ..services.activity_service import log_activity
from ..models.evaluation import EvaluationResponse

criteria_bp = Blueprint("criteria", __name__)


def _get_type_or_404(type_code):
    return EvaluationType.query.filter_by(code=type_code).first_or_404()


@criteria_bp.route("/<string:type_code>", methods=["GET"])
@login_required
def get_criteria(type_code):
    et = _get_type_or_404(type_code)

    parts = (
        EvaluationCriteria.query
        .filter_by(evaluation_type_id=et.id)
        .order_by(EvaluationCriteria.part_number)
        .all()
    )

    result = []

    for part in parts:
        active_questions = [
            question
            for question in part.questions
            if getattr(question, "is_active", True)
        ]

        if not active_questions:
            continue

        part_data = {
            "part_number": part.part_number,
            "title": part.title,
            "questions": [
                question.to_dict()
                for question in sorted(
                    active_questions,
                    key=lambda q: q.display_order
                )
            ],
        }

        result.append(part_data)

    return jsonify(result), 200


@criteria_bp.route("/<string:type_code>", methods=["PUT"])
@roles_required("admin", "hr")
def update_criteria(type_code):
    et = _get_type_or_404(type_code)
    data = request.get_json(silent=True)

    if not isinstance(data, list):
        return jsonify({"error": "Body must be a list of parts"}), 400

    existing_parts = (
        EvaluationCriteria.query
        .filter_by(evaluation_type_id=et.id)
        .all()
    )

    existing_questions = {}

    for part in existing_parts:
        for question in part.questions:
            existing_questions[question.question_code] = question

    existing_parts_by_number = {
        part.part_number: part
        for part in existing_parts
    }

    submitted_question_codes = set()

    for index, part_data in enumerate(data, start=1):
        part = existing_parts_by_number.get(index)

        if part is None:
            part = EvaluationCriteria(
                evaluation_type_id=et.id,
                part_number=index,
                title=part_data.get("title", ""),
            )

            db.session.add(part)
            db.session.flush()

        else:
            part.title = part_data.get("title", "")

        for order, question_data in enumerate(
            part_data.get("questions", [])
        ):
            question_code = question_data.get("id", "")
            question_text = question_data.get("text", "")

            if not question_code:
                continue

            submitted_question_codes.add(question_code)

            question = existing_questions.get(question_code)

            if question is not None:
                question.text = question_text
                question.display_order = order
                question.criteria_id = part.id
                question.is_active = True

            else:
                question = EvaluationQuestion(
                    criteria_id=part.id,
                    question_code=question_code,
                    text=question_text,
                    display_order=order,
                    is_active=True,
                )

                db.session.add(question)

    # -------------------------------------------------
    # Remove old questions that are no longer part
    # of the submitted criteria.
    ## Preserve questions that already have evaluation responses.
    # Questions with existing responses are deactivated instead of deleted. 
    # -------------------------------------------------
    for code, question in existing_questions.items():

        if code in submitted_question_codes:
            continue

        has_responses = (
            EvaluationResponse.query
            .filter_by(question_id=question.id)
            .first()
            is not None
        )

        if has_responses:
            question.is_active = False
        else:
            db.session.delete(question)

    db.session.commit()

    log_activity(
        f"Updated evaluation criteria for {et.label}",
        user_id=current_user.id
    )

    # Return ONLY active criteria/questions
    parts = (
        EvaluationCriteria.query
        .filter_by(evaluation_type_id=et.id)
        .order_by(EvaluationCriteria.part_number)
        .all()
    )

    result = []

    for part in parts:
        active_questions = [
            question
            for question in part.questions
            if getattr(question, "is_active", True)
        ]

        if not active_questions:
            continue

        result.append({
            "part_number": part.part_number,
            "title": part.title,
            "questions": [
                question.to_dict()
                for question in sorted(
                    active_questions,
                    key=lambda q: q.display_order
                )
            ],
        })

    return jsonify(result), 200