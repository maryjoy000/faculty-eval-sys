from flask import Blueprint, request, jsonify

from ..extensions import db
from ..models.weighting import EvaluationWeighting
from ..utils.decorators import roles_required
from flask_login import current_user
from ..services.activity_service import log_activity

weighting_bp = Blueprint("weighting", __name__)


@weighting_bp.route("", methods=["GET"])
@roles_required("admin", "hr")
def get_weighting():
    w = EvaluationWeighting.query.first_or_404()
    return jsonify(w.to_dict()), 200


@weighting_bp.route("", methods=["PUT"])
@roles_required("admin")
def update_weighting():
    w = EvaluationWeighting.query.first_or_404()
    data = request.get_json(silent=True) or {}

    fields = [
        "classroom_observation_pct", "domain6_share_pct", "domain7_share_pct",
        "peer_share_of_domain6_pct", "student_share_of_domain6_pct",
    ]
    updated = {f: data.get(f, getattr(w, f)) for f in fields}

    if round(updated["domain6_share_pct"] + updated["domain7_share_pct"], 2) != 100:
        return jsonify({"error": "domain6_share_pct + domain7_share_pct must equal 100"}), 400
    if round(updated["peer_share_of_domain6_pct"] + updated["student_share_of_domain6_pct"], 2) != 100:
        return jsonify({"error": "peer_share_of_domain6_pct + student_share_of_domain6_pct must equal 100"}), 400

    for f in fields:
        setattr(w, f, updated[f])

    db.session.commit()

    log_activity(
        "Updated evaluation score weighting",
        user_id=current_user.id
    )

    return jsonify(w.to_dict()), 200