from datetime import date
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from ..extensions import db
from ..models.evaluation_type import EvaluationType
from ..models.faculty import Faculty, FacultySection
from ..models.student import Student
from ..models.advisory import AdvisoryAssignment
from ..models.criteria import EvaluationQuestion, EvaluationCriteria
from ..models.rating_scale import RatingScale
from ..models.evaluation import Evaluation, EvaluationResponse
from ..utils.decorators import get_current_role, roles_required
from ..utils.eligibility import resolve_evaluator, check_self_evaluation, check_period_open, check_duplicate
from ..services.aggregation_service import get_faculty_evaluation_summary, get_classroom_observation_breakdown, get_student_evaluation_breakdown, get_peer_evaluation_breakdown, get_hr_evaluation_breakdown
from ..services.report_service import is_released, mark_viewed
from ..services.activity_service import log_activity
from ..utils.sentiment import analyze_sentiment
from ..utils.evaluation_rules import sanitize_comments
from ..models.evaluation_period import EvaluationPeriod

evaluations_bp = Blueprint("evaluations", __name__)

@evaluations_bp.route("/student/evaluators", methods=["GET"])
@roles_required("student")
def get_student_evaluators():
    student = Student.query.get(current_user.id)

    if not student:
        return jsonify({"error": "Student account not found"}), 404

    assignment = student.advisory_assignment

    if not assignment:
        return jsonify([]), 200

    # Start with the student's adviser.
    faculty_ids = {assignment.faculty_id}

    # Add faculty assigned to the same section.
    assigned_faculty = FacultySection.query.filter_by(
        grade_level=assignment.grade_level,
        section_name=assignment.section_name
    ).all()

    faculty_ids.update(item.faculty_id for item in assigned_faculty)

    faculty = (
        Faculty.query
        .filter(Faculty.id.in_(faculty_ids))
        .filter_by(status="Active")
        .order_by(Faculty.name)
        .all()
    )

    return jsonify([
        {
            **f.to_dict(),
            "is_adviser": f.id == assignment.faculty_id
        }
        for f in faculty
    ]), 200

@evaluations_bp.route("/student/status/<int:faculty_id>", methods=["GET"])
@roles_required("student")
def get_student_evaluation_status(faculty_id):
    student = Student.query.get(current_user.id)

    if not student:
        return jsonify({"error": "Student account not found"}), 404

    evaluation_type = EvaluationType.query.filter_by(
        code="student"
    ).first()

    if not evaluation_type:
        return jsonify({"error": "Student evaluation type not found"}), 404

    evaluation = (
        Evaluation.query
        .filter_by(
            evaluation_type_id=evaluation_type.id,
            faculty_id=faculty_id,
            evaluator_student_id=student.id
        )
        .order_by(Evaluation.submitted_at.desc())
        .first()
    )

    if not evaluation:
        return jsonify({
            "status": "not-evaluated",
            "rating": 0
        }), 200

    responses_by_question = {
        response.question_id: response.rating_value
        for response in evaluation.responses
    }

    criteria = (
        EvaluationCriteria.query
        .filter_by(evaluation_type_id=evaluation_type.id)
        .order_by(EvaluationCriteria.part_number)
        .all()
    )

    category_scores = []

    for criterion in criteria:
        ratings = []

        for question in sorted(
            criterion.questions,
            key=lambda q: q.display_order
        ):
            rating = responses_by_question.get(question.id)

            if rating is not None:
                ratings.append(rating)

        average = (
            sum(ratings) / len(ratings)
            if ratings
            else None
        )

        if average is not None:
            category_scores.append({
                "title": criterion.title.replace("\n", " — "),
                "average": round(average, 2)
            })

    return jsonify({
        "status": "evaluated",
        "rating": evaluation.overall_average or 0,
        "average": evaluation.overall_average,
        "submittedAt": (
            evaluation.submitted_at.isoformat()
            if evaluation.submitted_at
            else None
        ),
        "comments": evaluation.comments,
        "categoryScores": category_scores
    }), 200

@evaluations_bp.route("/count", methods=["GET"])
@roles_required("admin", "hr")
def get_evaluation_count():
    total = Evaluation.query.count()

    return jsonify({
        "total": total
    }), 200

@evaluations_bp.route("/dashboard-sentiment", methods=["GET", "OPTIONS"])
@roles_required("admin", "hr")
def get_dashboard_sentiment():
    student_evaluations = (
        Evaluation.query
        .join(EvaluationType)
        .filter(
            EvaluationType.code == "student",
            Evaluation.sentiment_label.isnot(None)
        )
        .all()
    )

    sentiment = {
        "positive": 0,
        "neutral": 0,
        "negative": 0
    }

    sentiment_scores = []

    for evaluation in student_evaluations:
        label = (evaluation.sentiment_label or "").lower()

        if label in sentiment:
            sentiment[label] += 1

        if evaluation.sentiment_score is not None:
            sentiment_scores.append(
                float(evaluation.sentiment_score)
            )

    total = sum(sentiment.values())

    average_sentiment_score = (
        round(
            sum(sentiment_scores) / len(sentiment_scores),
            3
        )
        if sentiment_scores
        else None
    )

    return jsonify({
        "positive": sentiment["positive"],
        "neutral": sentiment["neutral"],
        "negative": sentiment["negative"],
        "total": total,
        "average_sentiment_score": average_sentiment_score
    }), 200

@evaluations_bp.route("/dashboard-stats", methods=["GET"])
@roles_required("admin", "hr")
def get_dashboard_stats():
    active_faculty = Faculty.query.filter_by(status="Active").all()
    faculty_count = len(active_faculty)

    # --------------------------------------------
    # Peer-to-Peer Evaluation
    # --------------------------------------------
    possible_peer_evaluations = faculty_count * max(faculty_count - 1, 0)

    peer_evaluations = (
        Evaluation.query
        .join(EvaluationType)
        .filter(EvaluationType.code == "peerToPeer")
        .count()
    )

    peer_completion = (
        (peer_evaluations / possible_peer_evaluations) * 100
        if possible_peer_evaluations > 0
        else 0
    )

    # --------------------------------------------
    # Student Evaluation Completion
    # --------------------------------------------
    students = Student.query.all()
    possible_student_evaluations = 0

    for student in students:
        assignment = student.advisory_assignment

        if not assignment:
            continue

        eligible_faculty_ids = set()

        # Student's adviser
        if assignment.faculty_id:
            eligible_faculty_ids.add(assignment.faculty_id)

        # Faculty assigned to the student's section
        assigned_faculty = FacultySection.query.filter_by(
            grade_level=assignment.grade_level,
            section_name=assignment.section_name
        ).all()

        for item in assigned_faculty:
            if item.faculty_id:
                eligible_faculty_ids.add(item.faculty_id)

        possible_student_evaluations += len(eligible_faculty_ids)

    student_evaluations = (
        Evaluation.query
        .join(EvaluationType)
        .filter(EvaluationType.code == "student")
        .count()
    )

    student_completion = (
        (student_evaluations / possible_student_evaluations) * 100
        if possible_student_evaluations > 0
        else 0
    )

    # --------------------------------------------
    # Classroom Observation Completion
    # --------------------------------------------
    classroom_observations = (
        Evaluation.query
        .join(EvaluationType)
        .filter(EvaluationType.code == "classroomObservation")
        .count()
    )

    classroom_observation_completion = (
        (classroom_observations / faculty_count) * 100
        if faculty_count > 0
        else 0
    )

    # Faculty who have completed all evaluation types
    required_types = {
        "student",
        "classroomObservation",
        "peerToPeer",
        "hrEvaluation",
    }

    completed_faculty = 0

    for faculty in active_faculty:
        completed_types = {
            evaluation_type.code
            for evaluation_type in EvaluationType.query.join(
                Evaluation,
                Evaluation.evaluation_type_id == EvaluationType.id
            ).filter(
                Evaluation.faculty_id == faculty.id
            ).all()
        }

        if required_types.issubset(completed_types):
            completed_faculty += 1


    return jsonify({
        "peer_evaluation_percentage": round(peer_completion, 1),
        "student_evaluation_percentage": round(student_completion, 1),
        "classroom_observation_percentage": round(
            classroom_observation_completion, 1
        ),
        "completed_faculty_evaluations": completed_faculty,
        "total_active_faculty": faculty_count,
    }), 200

@evaluations_bp.route("/dashboard-recent", methods=["GET"])
@roles_required("admin", "hr")
def get_dashboard_recent_evaluations():
    evaluations = (
        Evaluation.query
        .join(EvaluationType)
        .filter(EvaluationType.code == "student")
        .order_by(Evaluation.submitted_at.desc())
        .limit(5)
        .all()
    )

    results = []

    for evaluation in evaluations:
        student = evaluation.evaluator_student
        faculty = evaluation.faculty

        results.append({
            "evaluation_id": evaluation.id,
            "faculty_name": faculty.name if faculty else "Unknown Faculty",
            "student_lrn": student.lrn if student else "Unknown LRN",
            "overall_average": evaluation.overall_average,
            "submitted_at": (
                evaluation.submitted_at.isoformat()
                if evaluation.submitted_at else None
            ),
        })

    return jsonify(results), 200

@evaluations_bp.route("/dashboard-top-faculty", methods=["GET"])
@roles_required("admin", "hr")
def get_dashboard_top_faculty():
    active_faculty = Faculty.query.filter_by(status="Active").all()

    results = []

    for faculty in active_faculty:
        summary = get_faculty_evaluation_summary(faculty.id)
        weighted_pct = summary.get("weighted_overall_pct")

        if weighted_pct is not None:
            results.append({
                "faculty_id": faculty.id,
                "name": faculty.name,
                "weighted_overall_pct": weighted_pct,
            })

    results.sort(
        key=lambda item: item["weighted_overall_pct"],
        reverse=True
    )

    return jsonify(results[:5]), 200

@evaluations_bp.route("/dashboard-classroom-observations", methods=["GET"])
@roles_required("admin", "hr")
def get_dashboard_classroom_observations():
    classroom_type = EvaluationType.query.filter_by(
        code="classroomObservation"
    ).first()

    if not classroom_type:
        return jsonify([]), 200

    active_faculty = Faculty.query.filter_by(status="Active").all()

    results = []

    for faculty in active_faculty:
        evaluation = (
            Evaluation.query
            .filter_by(
                faculty_id=faculty.id,
                evaluation_type_id=classroom_type.id
            )
            .order_by(Evaluation.submitted_at.desc())
            .first()
        )

        if evaluation:
            results.append({
                "evaluation_id": evaluation.id,
                "faculty_id": faculty.id,
                "overall_average": evaluation.overall_average,
                "overall_rating_pct": evaluation.overall_rating_pct,
                "submitted_at": (
                    evaluation.submitted_at.isoformat()
                    if evaluation.submitted_at else None
                ),
            })

    return jsonify(results), 200

@evaluations_bp.route("", methods=["POST"])
@login_required
def submit_evaluation():
    data = request.get_json(silent=True) or {}
    type_code = data.get("evaluation_type")
    faculty_id = data.get("faculty_id")
    responses = data.get("responses")
    comments = data.get("comments")

    if not type_code or not faculty_id or not isinstance(responses, list):
        return jsonify({"error": "evaluation_type, faculty_id, and responses are required"}), 400

    et = EvaluationType.query.filter_by(code=type_code).first()
    if not et:
        return jsonify({"error": f"Unknown evaluation_type '{type_code}'"}), 404

    faculty = Faculty.query.get(faculty_id)
    if not faculty:
        return jsonify({"error": "No faculty with that id"}), 404

    role = get_current_role()

    evaluator, error = resolve_evaluator(role, type_code)
    if error:
        return jsonify(error[0]), error[1]

    error = check_self_evaluation(type_code, evaluator, faculty_id)
    if error:
        return jsonify(error[0]), error[1]
    if role == "student":
        student = Student.query.get(evaluator["student_id"])
        if not student or not student.advisory_assignment:
            return jsonify({"error": "Student has no assigned section"}), 403

        assignment = student.advisory_assignment

        # Adviser is automatically eligible
        eligible_faculty_ids = {assignment.faculty_id}

        # Faculty assigned to the student's section are also eligible
        assigned_faculty = FacultySection.query.filter_by(
            grade_level=assignment.grade_level,
            section_name=assignment.section_name
        ).all()

        eligible_faculty_ids.update(
            item.faculty_id for item in assigned_faculty
        )

        if faculty_id not in eligible_faculty_ids:
            return jsonify({
                "error": "You are not allowed to evaluate this faculty member"
            }), 403


    error = check_period_open(type_code)
    if error:
        return jsonify(error[0]), error[1]

    period = None

    if type_code == "student":
        period = (
            EvaluationPeriod.query
            .filter(
                EvaluationPeriod.applies_to_type_id == et.id,
                EvaluationPeriod.start_date <= date.today(),
                EvaluationPeriod.end_date >= date.today(),
            )
            .order_by(EvaluationPeriod.id.desc())
            .first()
        )

        if not period:
            return jsonify({
                "error": "No open evaluation period for this evaluation type"
            }), 403


    error = check_duplicate(et.id, faculty_id, evaluator)
    if error:
        return jsonify(error[0]), error[1]

    all_questions = (
        EvaluationQuestion.query
        .join(EvaluationCriteria)
        .filter(
            EvaluationCriteria.evaluation_type_id == et.id,
            EvaluationQuestion.is_active.is_(True),
        )
        .all()
    )

    question_by_code = {
        q.question_code: q
        for q in all_questions
    }

    expected_codes = set(question_by_code.keys())

    scale = RatingScale.query.filter_by(evaluation_type_id=et.id).first()
    scale_max = max(label["value"] for label in scale.scale_labels) if scale else 5
    scale_min = min(label["value"] for label in scale.scale_labels) if scale else 1

    submitted_codes = set()
    for r in responses:
        code = r.get("question_id")
        rating = r.get("rating")
        if code not in question_by_code:
            return jsonify({"error": f"Unknown question_id '{code}' for this evaluation type"}), 400
        if not isinstance(rating, int) or not (scale_min <= rating <= scale_max):
            return jsonify({"error": f"rating for '{code}' must be an integer between {scale_min} and {scale_max}"}), 400
        submitted_codes.add(code)

    missing = expected_codes - submitted_codes
    if missing:
        return jsonify({"error": f"Missing ratings for questions: {sorted(missing)}"}), 400

    ratings = [r["rating"] for r in responses]
    overall_average = sum(ratings) / len(ratings)
    overall_rating_pct = (overall_average / scale_max) * 100

    # Classroom observation is rating-only; comments are dropped
    # server-side regardless of what the client sends.
    comments = sanitize_comments(type_code, comments)
    sentiment = analyze_sentiment(comments)

    evaluation = Evaluation(
        evaluation_type_id=et.id,
        faculty_id=faculty_id,
        evaluator_student_id=evaluator.get("student_id"),
        evaluation_period_id=period.id if period else None,
        evaluator_faculty_id=evaluator.get("faculty_id"),
        evaluator_user_id=evaluator.get("user_id"),
        overall_average=overall_average,
        overall_rating_pct=overall_rating_pct,
        comments=comments,
        sentiment_label=sentiment["label"] if sentiment else None,
        sentiment_score=sentiment["score"] if sentiment else None,
    )
    db.session.add(evaluation)
    db.session.flush()

    for r in responses:
        db.session.add(EvaluationResponse(
            evaluation_id=evaluation.id,
            question_id=question_by_code[r["question_id"]].id,
            rating_value=r["rating"],
        ))

    db.session.commit()

    # Peer (faculty) and hr/admin evaluators all log in via the users table --
    # only a student evaluator maps to student_id instead.
    log_activity(
        f'Submitted {type_code} evaluation for faculty #{faculty_id}',
        user_id=current_user.id if 'student_id' not in evaluator else None,
        student_id=evaluator.get('student_id'),
    )

    return jsonify(evaluation.to_dict()), 201

@evaluations_bp.route("/peer-status", methods=["GET"])
@roles_required("faculty")
def get_peer_evaluation_status():
    faculty = Faculty.query.filter_by(user_id=current_user.id).first()

    if not faculty:
        return jsonify({
            "error": "Faculty account is not linked to a faculty profile"
        }), 409

    peer_type = EvaluationType.query.filter_by(
        code="peerToPeer"
    ).first()

    if not peer_type:
        return jsonify({
            "error": "Peer-to-peer evaluation type not found"
        }), 404

    evaluations = Evaluation.query.filter_by(
        evaluation_type_id=peer_type.id,
        evaluator_faculty_id=faculty.id
    ).all()

    return jsonify([
        {
            "faculty_id": evaluation.faculty_id,
            "evaluation_id": evaluation.id,
            "status": "evaluated",
            "overall_average": evaluation.overall_average,
            "overall_rating_pct": evaluation.overall_rating_pct,
            "comments": evaluation.comments,
            "submitted_at": (
                evaluation.submitted_at.isoformat()
                if evaluation.submitted_at else None
            ),
        }
        for evaluation in evaluations
    ]), 200

@evaluations_bp.route("/hr-dashboard", methods=["GET"])
@roles_required("hr")
def get_hr_dashboard():
    hr_type = EvaluationType.query.filter_by(code="hrEvaluation").first()

    if not hr_type:
        return jsonify({"error": "HR evaluation type is not configured"}), 500

    faculty = (
        Faculty.query
        .filter_by(status="Active")
        .order_by(Faculty.name)
        .all()
    )

    evaluations = (
        Evaluation.query
        .filter_by(evaluation_type_id=hr_type.id)
        .all()
    )

    evaluation_by_faculty = {
        evaluation.faculty_id: evaluation
        for evaluation in evaluations
    }

    rows = []

    for member in faculty:
        evaluation = evaluation_by_faculty.get(member.id)

        rows.append({
            "id": member.id,
            "name": member.name,
            "completed": evaluation is not None,
            "rating": evaluation.overall_average if evaluation else None,
            "rating_pct": evaluation.overall_rating_pct if evaluation else None,
            "submitted_at": (
                evaluation.submitted_at.isoformat()
                if evaluation and evaluation.submitted_at
                else None
            ),
        })

    completed = sum(1 for row in rows if row["completed"])

    return jsonify({
        "total_faculty": len(rows),
        "completed": completed,
        "pending": len(rows) - completed,
        "evaluations": rows,
    }), 200

@evaluations_bp.route("/peer-status/<int:faculty_id>", methods=["GET"])
@roles_required("faculty")
def get_peer_evaluation_result(faculty_id):
    faculty = Faculty.query.filter_by(
        user_id=current_user.id
    ).first()

    if not faculty:
        return jsonify({
            "error": "Faculty account is not linked to a faculty profile"
        }), 409

    peer_type = EvaluationType.query.filter_by(
        code="peerToPeer"
    ).first()

    if not peer_type:
        return jsonify({
            "error": "Peer-to-peer evaluation type not found"
        }), 404

    evaluation = Evaluation.query.filter_by(
        evaluation_type_id=peer_type.id,
        faculty_id=faculty_id,
        evaluator_faculty_id=faculty.id
    ).first()

    if not evaluation:
        return jsonify({
            "error": "No peer evaluation found"
        }), 404

    # Build category scores using the current Criteria Management structure.
    category_scores = []

    criteria_parts = (
        EvaluationCriteria.query
        .filter_by(evaluation_type_id=peer_type.id)
        .order_by(EvaluationCriteria.part_number)
        .all()
    )

    responses_by_question_id = {
        response.question_id: response.rating_value
        for response in evaluation.responses
    }

    for part in criteria_parts:
        ratings = []

        for question in sorted(
            part.questions,
            key=lambda q: q.display_order
        ):
            rating = responses_by_question_id.get(question.id)

            if rating is not None:
                ratings.append(rating)

        average = (
            sum(ratings) / len(ratings)
            if ratings
            else 0
        )

        category_scores.append({
            "title": part.title.replace("\n", " — "),
            "average": round(average, 2)
        })

    return jsonify({
        "id": evaluation.id,
        "faculty_id": evaluation.faculty_id,
        "evaluator_faculty_id": evaluation.evaluator_faculty_id,
        "evaluation_type": "peerToPeer",
        "overall_average": evaluation.overall_average,
        "overall_rating_pct": evaluation.overall_rating_pct,
        "comments": evaluation.comments,
        "submitted_at": (
            evaluation.submitted_at.isoformat()
            if evaluation.submitted_at
            else None
        ),
        "categoryScores": category_scores,
    }), 200

@evaluations_bp.route("/<int:faculty_id>", methods=["GET"])
@roles_required("admin", "hr", "faculty")
def get_faculty_summary(faculty_id):
    role = get_current_role()

    if role == "faculty":
        own_faculty = Faculty.query.filter_by(user_id=current_user.id).first()
        if not own_faculty or own_faculty.id != faculty_id:
            return jsonify({"error": "Forbidden"}), 403
        if not is_released(faculty_id):
            return jsonify({"error": "Your report has not been released yet"}), 403
        mark_viewed(faculty_id)

    if not Faculty.query.get(faculty_id):
        return jsonify({"error": "No faculty with that id"}), 404

    return jsonify(get_faculty_evaluation_summary(faculty_id)), 200


@evaluations_bp.route("/<int:faculty_id>/classroom-breakdown", methods=["GET"])
@roles_required("admin", "hr", "faculty")
def get_classroom_breakdown(faculty_id):
    role = get_current_role()

    if role == "faculty":
        own_faculty = Faculty.query.filter_by(user_id=current_user.id).first()
        if not own_faculty or own_faculty.id != faculty_id:
            return jsonify({"error": "Forbidden"}), 403
        if not is_released(faculty_id):
            return jsonify({"error": "Your report has not been released yet"}), 403

    if not Faculty.query.get(faculty_id):
        return jsonify({"error": "No faculty with that id"}), 404

    breakdown = get_classroom_observation_breakdown(faculty_id)
    if breakdown is None:
        return jsonify({"error": "No classroom observation exists for this faculty member yet"}), 404

    return jsonify(breakdown), 200

@evaluations_bp.route("/<int:faculty_id>/student-breakdown", methods=["GET"])
@roles_required("admin", "hr", "faculty")
def get_student_breakdown(faculty_id):
    role = get_current_role()

    if role == "faculty":
        own_faculty = Faculty.query.filter_by(
            user_id=current_user.id
        ).first()

        if not own_faculty or own_faculty.id != faculty_id:
            return jsonify({"error": "Forbidden"}), 403

        if not is_released(faculty_id):
            return jsonify({
                "error": "Your report has not been released yet"
            }), 403

    if not Faculty.query.get(faculty_id):
        return jsonify({"error": "No faculty with that id"}), 404

    breakdown = get_student_evaluation_breakdown(faculty_id)

    if not breakdown:
        return jsonify({
            "error": "No student evaluation results available"
        }), 404

    return jsonify(breakdown), 200

@evaluations_bp.route("/<int:faculty_id>/peer-breakdown", methods=["GET"])
@roles_required("admin", "hr", "faculty")
def get_peer_breakdown(faculty_id):
    role = get_current_role()

    if role == "faculty":
        own_faculty = Faculty.query.filter_by(
            user_id=current_user.id
        ).first()

        if not own_faculty or own_faculty.id != faculty_id:
            return jsonify({"error": "Forbidden"}), 403

        if not is_released(faculty_id):
            return jsonify({
                "error": "Your report has not been released yet"
            }), 403

    if not Faculty.query.get(faculty_id):
        return jsonify({"error": "No faculty with that id"}), 404

    breakdown = get_peer_evaluation_breakdown(faculty_id)

    if not breakdown:
        return jsonify({
            "error": "No peer evaluation results available"
        }), 404

    return jsonify(breakdown), 200

@evaluations_bp.route("/<int:faculty_id>/hr-breakdown", methods=["GET"])
@roles_required("admin", "hr", "faculty")
def get_hr_breakdown(faculty_id):
    role = get_current_role()

    if role == "faculty":
        own_faculty = Faculty.query.filter_by(
            user_id=current_user.id
        ).first()

        if not own_faculty or own_faculty.id != faculty_id:
            return jsonify({"error": "Forbidden"}), 403

        if not is_released(faculty_id):
            return jsonify({
                "error": "Your report has not been released yet"
            }), 403

    if not Faculty.query.get(faculty_id):
        return jsonify({"error": "No faculty with that id"}), 404

    breakdown = get_hr_evaluation_breakdown(faculty_id)

    if not breakdown:
        return jsonify({
            "error": "No HR evaluation results available"
        }), 404

    return jsonify(breakdown), 200