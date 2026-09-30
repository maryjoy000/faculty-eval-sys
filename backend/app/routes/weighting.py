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
    term_id = request.args.get("term_id", type=int)
    w = EvaluationWeighting.resolve_for_term(term_id)

    if w is None:
        return jsonify({"error": "No weighting configured"}), 404

    return jsonify(w.to_dict()), 200


@weighting_bp.route("", methods=["PUT"])
@roles_required("admin")
def update_weighting():
    from ..models.school_term import SchoolTerm

    data = request.get_json(silent=True) or {}
    term_id = data.get("term_id")

    if term_id is not None:
        term = SchoolTerm.query.get(term_id)

        if not term:
            return jsonify({"error": "School term not found"}), 404

        w = EvaluationWeighting.query.filter_by(term_id=term.id).first()

        if w is None:
            w = EvaluationWeighting(term_id=term.id)
            db.session.add(w)
            db.session.flush()
    else:
        w = (
            EvaluationWeighting.query
            .filter_by(term_id=None)
            .first_or_404()
        )

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

    if w.term_id is not None:
        log_activity(
            f"Updated evaluation score weighting for term #{w.term_id}",
            user_id=current_user.id
        )
    else:
        log_activity(
            "Updated default evaluation score weighting",
            user_id=current_user.id
        )

    return jsonify(w.to_dict()), 200