"""
Weighting math and classroom-observation COT/HCEC/Level derivation.
Centralized here rather than duplicated across routes/reports later.
"""
from ..models.evaluation import Evaluation
from ..models.evaluation_type import EvaluationType
from ..models.weighting import EvaluationWeighting
from ..models.criteria import EvaluationQuestion, EvaluationCriteria


def compute_effective_weights(weighting):
    classroom = weighting.classroom_observation_pct
    remainder = 100 - classroom
    domain6 = remainder * weighting.domain6_share_pct / 100
    domain7 = remainder * weighting.domain7_share_pct / 100
    peer = domain6 * weighting.peer_share_of_domain6_pct / 100
    student = domain6 * weighting.student_share_of_domain6_pct / 100
    hr = domain7

    return {
        "classroomObservation": classroom,
        "peerToPeer": peer,
        "student": student,
        "hrEvaluation": hr,
    }


def get_faculty_evaluation_summary(faculty_id):
    per_type = {}

    for et in EvaluationType.query.all():
        evaluations = (
            Evaluation.query
            .filter_by(
                evaluation_type_id=et.id,
                faculty_id=faculty_id
            )
            .all()
        )

        if not evaluations:
            per_type[et.code] = {
                "count": 0,
                "average_rating": None,
                "average_rating_pct": None
            }
            continue

        valid_averages = [
            evaluation.overall_average
            for evaluation in evaluations
            if evaluation.overall_average is not None
        ]

        valid_percentages = [
            evaluation.overall_rating_pct
            for evaluation in evaluations
            if evaluation.overall_rating_pct is not None
        ]

        average_rating = (
            sum(valid_averages) / len(valid_averages)
            if valid_averages
            else None
        )

        average_rating_pct = (
            sum(valid_percentages) / len(valid_percentages)
            if valid_percentages
            else None
        )

        per_type[et.code] = {
            "count": len(evaluations),
            "average_rating": (
                round(average_rating, 2)
                if average_rating is not None
                else None
            ),
            "average_rating_pct": (
                round(average_rating_pct, 2)
                if average_rating_pct is not None
                else None
            )
        }

    weighting = EvaluationWeighting.query.first()

    effective_weights = (
        compute_effective_weights(weighting)
        if weighting
        else {}
    )

    available = {
        code: data
        for code, data in per_type.items()
        if data["count"] > 0
        and data["average_rating_pct"] is not None
    }

    total_weight = sum(
        effective_weights.get(code, 0)
        for code in available
    )

    if total_weight > 0:
        weighted_overall_pct = round(
            sum(
                effective_weights.get(code, 0)
                * available[code]["average_rating_pct"]
                for code in available
            )
            / total_weight,
            2
        )
    else:
        weighted_overall_pct = None

    return {
        "faculty_id": faculty_id,
        "per_type": per_type,
        "effective_weights": {
            key: round(value, 2)
            for key, value in effective_weights.items()
        },
        "weighted_overall_pct": weighted_overall_pct
    }

# ============================================
# Classroom Observation: COT / HCEC / Level derivation
# ============================================
# HCEC Equivalent = the score as recorded from Admin's classroom
# observation. COT Rating = HCEC Equivalent + 1, per school policy:
# Level 1 ("Not Evident") is never assigned, so the recorded 1-5 scale
# is shifted up to the physical form's 2-6 COT scale.
# Copied exactly from report-helpers.js's COT_LEVEL_DESCRIPTIONS.

COT_LEVEL_DESCRIPTIONS = [
    {"level": 1, "name": "Not Evident", "text": "The teacher does not demonstrate the indicator."},
    {"level": 2, "name": "Building", "text": "The teacher demonstrates a limited range of separate aspects of the indicator."},
    {"level": 3, "name": "Organizing", "text": "The teacher demonstrates a limited range of loosely-associated pedagogical aspects of the indicator."},
    {"level": 4, "name": "Developing", "text": "The teacher demonstrates a range of associated pedagogical aspects of the indicator that sometimes aligned with the learners' developmental needs."},
    {"level": 5, "name": "Applying", "text": "The teacher demonstrates a range of associated pedagogical aspects of the indicator that are usually aligned with the learners' developmental needs."},
    {"level": 6, "name": "Consolidating", "text": "The teacher uses well-connected pedagogical aspects of the indicator that are consistently aligned with student development and support students to be successful learners."},
]


def get_cot_level_label(hcec):
    cot_rating = hcec + 1
    rounded = min(6, max(1, round(cot_rating)))
    return next(l["name"] for l in COT_LEVEL_DESCRIPTIONS if l["level"] == rounded)


def get_classroom_observation_breakdown(faculty_id):
    """
    Returns the domain > indicator > COT/HCEC/Level breakdown for a
    faculty member's most recent classroom observation, or None if none
    exists yet.
    """
    et = EvaluationType.query.filter_by(code="classroomObservation").first()
    evaluation = (
        Evaluation.query
        .filter_by(evaluation_type_id=et.id, faculty_id=faculty_id)
        .order_by(Evaluation.submitted_at.desc())
        .first()
    )
    if not evaluation:
        return None

    responses_by_question_id = {r.question_id: r.rating_value for r in evaluation.responses}

    domains = []
    criteria_parts = (
        EvaluationCriteria.query
        .filter_by(evaluation_type_id=et.id)
        .order_by(EvaluationCriteria.part_number)
        .all()
    )
    for part in criteria_parts:
        questions = sorted(part.questions, key=lambda q: q.display_order)
        indicators = []
        ratings = []
        indicator_number = 0
        for q in questions:
            rating = responses_by_question_id.get(q.id)
            if rating is None:
                continue
            indicator_number += 1
            ratings.append(rating)
            indicators.append({
                "indicator_number": indicator_number,
                "text": q.text,
                "hcec": rating,
                "cot": rating + 1,
                "level": get_cot_level_label(rating),
            })

        domain_average = sum(ratings) / len(ratings) if ratings else None
        domains.append({
            "part_number": part.part_number,
            "title": part.title,
            "average": round(domain_average, 2) if domain_average is not None else None,
            "indicators": indicators,
        })

    return {
        "faculty_id": faculty_id,
        "evaluation_id": evaluation.id,
        "overall_average": evaluation.overall_average,
        "overall_rating_pct": evaluation.overall_rating_pct,
        "domains": domains,
    }

def get_student_evaluation_breakdown(faculty_id):
    et = EvaluationType.query.filter_by(code="student").first()

    if not et:
        return None

    evaluations = (
        Evaluation.query
        .filter_by(
            faculty_id=faculty_id,
            evaluation_type_id=et.id
        )
        .order_by(Evaluation.submitted_at.asc())
        .all()
    )

    if not evaluations:
        return None

    questions = (
        EvaluationQuestion.query
        .join(EvaluationCriteria)
        .filter(EvaluationCriteria.evaluation_type_id == et.id)
        .order_by(
            EvaluationCriteria.part_number,
            EvaluationQuestion.display_order
        )
        .all()
    )

    question_ids = [q.id for q in questions]

    # Accumulate every rating from every student submission.
    question_totals = {question_id: [] for question_id in question_ids}

    for evaluation in evaluations:
        for response in evaluation.responses:
            if response.question_id in question_totals:
                question_totals[response.question_id].append(
                    response.rating_value
                )

    domains = []

    criteria_parts = (
        EvaluationCriteria.query
        .filter_by(evaluation_type_id=et.id)
        .order_by(EvaluationCriteria.part_number)
        .all()
    )

    for part in criteria_parts:
        indicators = []
        indicator_ratings = []

        part_questions = sorted(
            part.questions,
            key=lambda q: q.display_order
        )

        for question in part_questions:
            values = question_totals.get(question.id, [])

            average = (
                sum(values) / len(values)
                if values
                else None
            )

            if average is not None:
                indicator_ratings.append(average)

            indicators.append({
                "question_id": question.id,
                "text": question.text,
                "average": round(average, 2)
                if average is not None
                else None,
                "response_count": len(values),
            })

        domain_average = (
            sum(indicator_ratings) / len(indicator_ratings)
            if indicator_ratings
            else None
        )

        domains.append({
            "part_number": part.part_number,
            "title": part.title,
            "average": round(domain_average, 2)
            if domain_average is not None
            else None,
            "indicators": indicators,
        })

    overall_average = (
        sum(e.overall_average for e in evaluations)
        / len(evaluations)
    )

    overall_rating_pct = (
        overall_average / 5
    ) * 100

    comments = []

    sentiment_counts = {
        "Positive": 0,
        "Neutral": 0,
        "Negative": 0,
    }

    for evaluation in evaluations:
        if evaluation.comments and evaluation.comments.strip():
            sentiment = (evaluation.sentiment_label or "neutral").capitalize()

            comments.append({
                "text": evaluation.comments,
                "sentiment": sentiment,
                "submitted_at": (
                    evaluation.submitted_at.isoformat()
                    if evaluation.submitted_at
                    else None
                ),
            })

            if sentiment in sentiment_counts:
                sentiment_counts[sentiment] += 1

    total_comments = len(comments)

    sentiment_percentages = {
        label: round(
            (count / total_comments) * 100,
            2
        ) if total_comments else 0
        for label, count in sentiment_counts.items()
    }

    return {
        "faculty_id": faculty_id,
        "evaluation_type": "student",
        "submission_count": len(evaluations),

        "average_rating": round(
            overall_average,
            2
        ),

        "average_rating_pct": round(
            overall_rating_pct,
            2
        ),

        "domains": domains,

        "comments": comments,

        "sentiment": {
            "counts": sentiment_counts,
            "percentages": sentiment_percentages,
            "total_comments": total_comments,
        },
    }

def get_peer_evaluation_breakdown(faculty_id):
    et = EvaluationType.query.filter_by(code="peerToPeer").first()

    if not et:
        return None

    evaluations = (
        Evaluation.query
        .filter_by(
            evaluation_type_id=et.id,
            faculty_id=faculty_id
        )
        .order_by(Evaluation.submitted_at.asc())
        .all()
    )

    if not evaluations:
        return None

    question_ratings = {}

    for evaluation in evaluations:
        for response in evaluation.responses:
            question_ratings.setdefault(
                response.question_id, []
            ).append(response.rating_value)

    domains = []

    criteria_parts = (
        EvaluationCriteria.query
        .filter_by(evaluation_type_id=et.id)
        .order_by(EvaluationCriteria.part_number)
        .all()
    )

    for part in criteria_parts:
        questions = sorted(
            part.questions,
            key=lambda q: q.display_order
        )

        indicators = []
        part_ratings = []

        for index, question in enumerate(questions, start=1):
            ratings = question_ratings.get(question.id, [])

            if not ratings:
                continue

            average = sum(ratings) / len(ratings)

            part_ratings.extend(ratings)

            indicators.append({
                "indicator_number": index,
                "text": question.text,
                "average": round(average, 2),
                "response_count": len(ratings)
            })

        domain_average = (
            sum(part_ratings) / len(part_ratings)
            if part_ratings
            else None
        )

        domains.append({
            "part_number": part.part_number,
            "title": part.title,
            "average": (
                round(domain_average, 2)
                if domain_average is not None
                else None
            ),
            "indicators": indicators
        })

    overall_ratings = [
        evaluation.overall_average
        for evaluation in evaluations
        if evaluation.overall_average is not None
    ]

    overall_average = (
        sum(overall_ratings) / len(overall_ratings)
        if overall_ratings
        else None
    )

    overall_rating_pct = (
        (overall_average / 5) * 100
        if overall_average is not None
        else None
    )

    comments = []

    for evaluation in evaluations:
        if evaluation.comments and evaluation.comments.strip():
            comments.append({
                "text": evaluation.comments,
                "sentiment": (
                    evaluation.sentiment_label.capitalize()
                    if evaluation.sentiment_label
                    else None
                ),
                "sentiment_score": (
                    float(evaluation.sentiment_score)
                    if evaluation.sentiment_score is not None
                    else None
                ),
                "submitted_at": (
                    evaluation.submitted_at.isoformat()
                    if evaluation.submitted_at
                    else None
                )
            })

    return {
        "faculty_id": faculty_id,
        "evaluation_type": "peerToPeer",
        "submission_count": len(evaluations),
        "average_rating": (
            round(overall_average, 2)
            if overall_average is not None
            else None
        ),
        "average_rating_pct": (
            round(overall_rating_pct, 2)
            if overall_rating_pct is not None
            else None
        ),
        "overall_average": (
            round(overall_average, 2)
            if overall_average is not None
            else None
        ),
        "domains": domains,
        "comments": comments
    }

def get_hr_evaluation_breakdown(faculty_id):
    et = EvaluationType.query.filter_by(code="hrEvaluation").first()

    if not et:
        return None

    evaluations = (
        Evaluation.query
        .filter_by(
            evaluation_type_id=et.id,
            faculty_id=faculty_id
        )
        .order_by(Evaluation.submitted_at.desc())
        .all()
    )

    if not evaluations:
        return None

    question_ratings = {}

    for evaluation in evaluations:
        for response in evaluation.responses:
            question_ratings.setdefault(response.question_id, []).append(
                response.rating_value
            )

    domains = []

    criteria_parts = (
        EvaluationCriteria.query
        .filter_by(evaluation_type_id=et.id)
        .order_by(EvaluationCriteria.part_number)
        .all()
    )

    for part in criteria_parts:
        questions = sorted(
            part.questions,
            key=lambda q: q.display_order
        )

        indicators = []
        part_ratings = []

        for index, question in enumerate(questions, start=1):
            ratings = question_ratings.get(question.id, [])

            if not ratings:
                continue

            average = sum(ratings) / len(ratings)
            part_ratings.extend(ratings)

            indicators.append({
                "indicator_number": index,
                "text": question.text,
                "average": round(average, 2)
            })

        domain_average = (
            sum(part_ratings) / len(part_ratings)
            if part_ratings
            else None
        )

        domains.append({
            "part_number": part.part_number,
            "title": part.title,
            "average": (
                round(domain_average, 2)
                if domain_average is not None
                else None
            ),
            "indicators": indicators
        })

        comments = []

    for evaluation in evaluations:
        if evaluation.comments and evaluation.comments.strip():
            comments.append({
                "text": evaluation.comments,
                "sentiment": (
                    evaluation.sentiment_label.capitalize()
                    if evaluation.sentiment_label
                    else None
                ),
                "sentiment_score": (
                    float(evaluation.sentiment_score)
                    if evaluation.sentiment_score is not None
                    else None
                ),
                "submitted_at": (
                    evaluation.submitted_at.isoformat()
                    if evaluation.submitted_at
                    else None
                )
            })

    return {
        "faculty_id": faculty_id,
        "evaluation_count": len(evaluations),
        "submitted_at": (
            evaluations[0].submitted_at.isoformat()
            if evaluations[0].submitted_at
            else None
        ),
        "domains": domains,
        "comments": comments
    }

