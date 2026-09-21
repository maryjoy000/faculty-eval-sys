from collections import Counter

from ..models.evaluation import Evaluation, EvaluationResponse
from ..models.evaluation_type import EvaluationType
from ..models.faculty import Faculty
from .aggregation_service import get_faculty_evaluation_summary


STUDENT_EVALUATION_CODES = {"student"}
PEER_EVALUATION_CODES = {"peerToPeer"}

SENTIMENT_LABELS = ("Positive", "Neutral", "Negative")


THEME_KEYWORDS = {
    "Clear Explanations": [
        "clear",
        "clarify",
        "clarification",
        "explains",
        "explain",
        "explanation",
        "malinaw",
        "magaling mag explain",
        "maayos mag explain",
    ],
    "Communication": [
        "communication",
        "communicate",
        "communicates",
        "pakikipag",
        "pakikipag-usap",
        "magsalita",
        "speaks",
        "talks",
    ],
    "Teaching Methods": [
        "teaching method",
        "teaching methods",
        "method",
        "methods",
        "strategy",
        "strategies",
        "approach",
        "teaching style",
        "paraan ng pagtuturo",
        "pamamaraan",
    ],
    "Engagement": [
        "engaging",
        "engagement",
        "interactive",
        "interaction",
        "participation",
        "participate",
        "activity",
        "activities",
        "interesado",
        "masaya",
    ],
    "Subject Knowledge": [
        "knowledge",
        "knowledgeable",
        "mastery",
        "expert",
        "expertise",
        "understands",
        "understand",
        "alam",
        "kaalaman",
    ],
    "Approachability": [
        "approachable",
        "approachability",
        "friendly",
        "accommodating",
        "helpful",
        "patient",
        "mabait",
        "madaling lapitan",
        "maasikaso",
    ],
    "Punctuality": [
        "on time",
        "punctual",
        "punctuality",
        "late",
        "lateness",
        "laging on time",
        "oras",
        "nahuhuli",
    ],
    "Assessment": [
        "exam",
        "exams",
        "quiz",
        "quizzes",
        "test",
        "tests",
        "assessment",
        "grading",
        "grade",
        "grades",
        "evaluation",
        "evaluator",
    ],
    "Fairness": [
        "fair",
        "fairness",
        "equal",
        "equality",
        "bias",
        "biased",
        "just",
        "makatarungan",
        "pantay",
    ],
}


def _normalize_sentiment(label):
    if not label:
        return None

    normalized = str(label).strip().lower()

    if normalized == "positive":
        return "Positive"

    if normalized == "neutral":
        return "Neutral"

    if normalized == "negative":
        return "Negative"

    return None


def _empty_sentiment():
    return {
        "counts": {
            "Positive": 0,
            "Neutral": 0,
            "Negative": 0
        },
        "percentages": {
            "Positive": 0,
            "Neutral": 0,
            "Negative": 0
        },
        "total_comments": 0
    }


def _build_sentiment_summary(evaluations):
    counts = {
        "Positive": 0,
        "Neutral": 0,
        "Negative": 0
    }

    for evaluation in evaluations:
        if not evaluation.comments or not evaluation.comments.strip():
            continue

        label = _normalize_sentiment(evaluation.sentiment_label)

        if label:
            counts[label] += 1

    total = sum(counts.values())

    percentages = {
        label: round((counts[label] / total) * 100, 2)
        if total
        else 0
        for label in SENTIMENT_LABELS
    }

    return {
        "counts": counts,
        "percentages": percentages,
        "total_comments": total
    }


def _get_evaluation_source(evaluation, evaluation_type_by_id):
    evaluation_type = evaluation_type_by_id.get(
        evaluation.evaluation_type_id
    )

    if not evaluation_type:
        return None

    if evaluation_type.code in STUDENT_EVALUATION_CODES:
        return "Student"

    if evaluation_type.code in PEER_EVALUATION_CODES:
        return "Peer"

    return None


def _build_source_sentiment(evaluations, evaluation_type_by_id):
    source_counts = {
        "Student": {
            "Positive": 0,
            "Neutral": 0,
            "Negative": 0
        },
        "Peer": {
            "Positive": 0,
            "Neutral": 0,
            "Negative": 0
        }
    }

    for evaluation in evaluations:
        if not evaluation.comments or not evaluation.comments.strip():
            continue

        source = _get_evaluation_source(
            evaluation,
            evaluation_type_by_id
        )

        if not source:
            continue

        sentiment = _normalize_sentiment(
            evaluation.sentiment_label
        )

        if sentiment:
            source_counts[source][sentiment] += 1

    return [
        {
            "source": source,
            "Positive": counts["Positive"],
            "Neutral": counts["Neutral"],
            "Negative": counts["Negative"]
        }
        for source, counts in source_counts.items()
    ]


def _build_rating_sentiment(evaluations, evaluation_type_by_id):
    grouped = {}

    for evaluation in evaluations:
        if not evaluation.comments or not evaluation.comments.strip():
            continue

        source = _get_evaluation_source(
            evaluation,
            evaluation_type_by_id
        )

        sentiment = _normalize_sentiment(
            evaluation.sentiment_label
        )

        if not source or not sentiment:
            continue

        key = (source, sentiment)

        if key not in grouped:
            grouped[key] = {
                "source": source,
                "sentiment": sentiment,
                "count": 0,
                "rating_sum": 0
            }

        if evaluation.overall_average is None:
            continue

        grouped[key]["count"] += 1
        grouped[key]["rating_sum"] += float(
            evaluation.overall_average
        )

    result = []

    for item in grouped.values():
        result.append({
            "source": item["source"],
            "sentiment": item["sentiment"],
            "count": item["count"],
            "average_rating": round(
                item["rating_sum"] / item["count"],
                2
            ) if item["count"] else 0
        })

    result.sort(
        key=lambda item: (
            item["source"],
            SENTIMENT_LABELS.index(item["sentiment"])
        )
    )

    return result


def _build_feedback_themes(evaluations):
    theme_counts = Counter()

    for evaluation in evaluations:
        if not evaluation.comments:
            continue

        comment = evaluation.comments.strip().lower()

        if not comment:
            continue

        for theme, keywords in THEME_KEYWORDS.items():
            if any(keyword in comment for keyword in keywords):
                theme_counts[theme] += 1

    return [
        {
            "theme": theme,
            "mentions": count
        }
        for theme, count in theme_counts.most_common()
    ]


def _build_key_testimonials(evaluations, evaluation_type_by_id):
    candidates = []

    for evaluation in evaluations:
        if not evaluation.comments or not evaluation.comments.strip():
            continue

        source = _get_evaluation_source(
            evaluation,
            evaluation_type_by_id
        )

        if not source:
            continue

        sentiment = _normalize_sentiment(
            evaluation.sentiment_label
        )

        if not sentiment:
            continue

        candidates.append({
            "text": evaluation.comments.strip(),
            "sentiment": sentiment,
            "source": source,
            "score": (
                float(evaluation.sentiment_score)
                if evaluation.sentiment_score is not None
                else 0
            ),
            "submitted_at": (
                evaluation.submitted_at.isoformat()
                if evaluation.submitted_at
                else None
            )
        })

    positive = [
        item for item in candidates
        if item["sentiment"] == "Positive"
    ]

    positive.sort(
        key=lambda item: (
            item["score"],
            item["submitted_at"] or ""
        ),
        reverse=True
    )

    selected = positive[:3]

    if len(selected) < 3:
        remaining = [
            item for item in candidates
            if item not in selected
        ]

        remaining.sort(
            key=lambda item: item["submitted_at"] or "",
            reverse=True
        )

        selected.extend(
            remaining[:3 - len(selected)]
        )

    return selected


def _build_latest_comments(evaluations, evaluation_type_by_id):
    comments = []

    for evaluation in evaluations:
        if not evaluation.comments or not evaluation.comments.strip():
            continue

        source = _get_evaluation_source(
            evaluation,
            evaluation_type_by_id
        )

        if not source:
            continue

        comments.append({
            "text": evaluation.comments.strip(),
            "sentiment": _normalize_sentiment(
                evaluation.sentiment_label
            ),
            "source": source,
            "submitted_at": (
                evaluation.submitted_at.isoformat()
                if evaluation.submitted_at
                else None
            )
        })

    comments.sort(
        key=lambda item: item["submitted_at"] or "",
        reverse=True
    )

    return comments[:10]


def get_analytics_overview():
    all_evals = Evaluation.query.all()

    evaluation_types = EvaluationType.query.all()

    evaluation_type_by_id = {
        evaluation_type.id: evaluation_type
        for evaluation_type in evaluation_types
    }

    total = len(all_evals)

    by_type = {}

    for evaluation_type in evaluation_types:
        by_type[evaluation_type.code] = sum(
            1
            for evaluation in all_evals
            if evaluation.evaluation_type_id == evaluation_type.id
        )

    overall_average_rating_pct = (
        round(
            sum(
                e.overall_rating_pct
                for e in all_evals
                if e.overall_rating_pct is not None
            )
            /
            len([
                e for e in all_evals
                if e.overall_rating_pct is not None
            ]),
            2
        )
        if any(
            e.overall_rating_pct is not None
            for e in all_evals
        )
        else None
    )

    distribution = {
        str(i): 0
        for i in range(1, 6)
    }

    for response in EvaluationResponse.query.all():
        key = str(response.rating_value)

        if key in distribution:
            distribution[key] += 1

    student_evaluations = [
        evaluation
        for evaluation in all_evals
        if _get_evaluation_source(
            evaluation,
            evaluation_type_by_id
        ) == "Student"
    ]

    peer_evaluations = [
        evaluation
        for evaluation in all_evals
        if _get_evaluation_source(
            evaluation,
            evaluation_type_by_id
        ) == "Peer"
    ]

    student_sentiment = _build_sentiment_summary(
        student_evaluations
    )

    peer_sentiment = _build_sentiment_summary(
        peer_evaluations
    )

    relevant_evaluations = (
        student_evaluations +
        peer_evaluations
    )

    scored = []

    for faculty in Faculty.query.all():
        summary = get_faculty_evaluation_summary(faculty.id)

        if summary["weighted_overall_pct"] is not None:
            scored.append({
                "faculty_id": faculty.id,
                "name": faculty.name,
                "weighted_overall_pct": summary[
                    "weighted_overall_pct"
                ],
            })

    scored.sort(
        key=lambda item: item["weighted_overall_pct"],
        reverse=True
    )

    return {
        "total_evaluations": total,

        "evaluations_by_type": by_type,

        "overall_average_rating_pct":
            overall_average_rating_pct,

        "rating_distribution":
            distribution,

        "top_rated_faculty":
            scored[:5],

        "student_sentiment":
            student_sentiment,

        "peer_sentiment":
            peer_sentiment,

        "sentiment_by_source":
            _build_source_sentiment(
                relevant_evaluations,
                evaluation_type_by_id
            ),

        "rating_sentiment":
            _build_rating_sentiment(
                relevant_evaluations,
                evaluation_type_by_id
            ),

        "common_themes":
            _build_feedback_themes(
                relevant_evaluations
            ),

        "key_testimonials":
            _build_key_testimonials(
                relevant_evaluations,
                evaluation_type_by_id
            ),

        "latest_comments":
            _build_latest_comments(
                relevant_evaluations,
                evaluation_type_by_id
            )
    }