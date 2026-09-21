from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from ..extensions import db
from ..models.evaluation_type import EvaluationType
from ..models.rating_scale import RatingScale
from ..utils.decorators import roles_required
from ..services.activity_service import log_activity

rating_scales_bp = Blueprint("rating_scales", __name__)


@rating_scales_bp.route("/<string:type_code>", methods=["GET"])
@login_required
def get_scale(type_code):
    et = EvaluationType.query.filter_by(code=type_code).first_or_404()
    scale = RatingScale.query.filter_by(evaluation_type_id=et.id).first_or_404()
    return jsonify(scale.to_dict()), 200


@rating_scales_bp.route("/<string:type_code>", methods=["PUT"])
@roles_required("admin", "hr")
def update_scale(type_code):
    et = EvaluationType.query.filter_by(code=type_code).first_or_404()
    scale = RatingScale.query.filter_by(evaluation_type_id=et.id).first_or_404()
    data = request.get_json(silent=True) or {}

    if "scale_labels" in data:
        scale.scale_labels = data["scale_labels"]
    if "equivalents" in data:
        scale.equivalents = data["equivalents"]

    db.session.commit()
    log_activity(f"Updated rating scale for {et.label}", user_id=current_user.id)
    return jsonify(scale.to_dict()), 200