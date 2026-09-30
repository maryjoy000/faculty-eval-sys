from flask import Blueprint, jsonify, request

from ..models.evaluation_type import EvaluationType
from ..models.faculty import Faculty
from ..models.rating_scale import RatingScale
from ..services.aggregation_service import get_faculty_evaluation_summary
from ..utils.decorators import roles_required
from ..utils.terms import resolve_term_param
from ..services.analytics_service import get_analytics_overview

analytics_bp = Blueprint("analytics", __name__)


@analytics_bp.route("/overview", methods=["GET"])
@roles_required("admin", "hr")
def overview():
    term_id, term_error = resolve_term_param()
    if term_error:
        return term_error[0], term_error[1]

    return jsonify(get_analytics_overview(term_id)), 200


@analytics_bp.route("/rating-distribution", methods=["GET"])
@roles_required("admin", "hr")
def rating_distribution():
    """Faculty headcount per rating band for one evaluation type.

    Query: ?evaluation_type=student&term_id=. Response bands carry the
    faculty in each band so the frontend can drill down (click a bar to
    see who). Bands come from the type's own equivalence scale, so a
    rescaled type never mislabels anyone.
    """
    type_code = (request.args.get("evaluation_type") or "").strip()

    evaluation_type = EvaluationType.query.filter_by(code=type_code).first()

    if not evaluation_type:
        return jsonify({
            "error": "Unknown evaluation_type. Use one of: "
                     "student, classroomObservation, peerToPeer, hrEvaluation."
        }), 400

    term_id, term_error = resolve_term_param()
    if term_error:
        return term_error[0], term_error[1]

    scale = RatingScale.query.filter_by(
        evaluation_type_id=evaluation_type.id
    ).first()

    bands = []
    if scale and isinstance(scale.equivalents, list):
        bands = sorted(
            scale.equivalents,
            key=lambda band: float(band.get("min", 0)),
            reverse=True,
        )

    results = [
        {
            "label": str(band.get("label", "")),
            "min": band.get("min"),
            "max": band.get("max"),
            "count": 0,
            "faculty": [],
        }
        for band in bands
    ]

    def find_band(average):
        for index, band in enumerate(bands):
            try:
                low = float(band.get("min"))
                high = float(band.get("max"))
            except (TypeError, ValueError):
                continue
            if low <= average <= high:
                return index
        return None

    active_faculty = (
        Faculty.query
        .filter_by(status="Active")
        .order_by(Faculty.name)
        .all()
    )

    for faculty in active_faculty:
        summary = get_faculty_evaluation_summary(faculty.id, term_id)
        entry = summary.get("per_type", {}).get(type_code) or {}
        average = entry.get("average_rating")

        if average is None:
            continue

        band_index = find_band(float(average))

        if band_index is None:
            continue

        results[band_index]["count"] += 1
        results[band_index]["faculty"].append({
            "id": faculty.id,
            "name": faculty.name,
            "average": round(float(average), 2),
        })

    return jsonify({
        "evaluation_type": type_code,
        "term_id": term_id,
        "bands": results,
    }), 200