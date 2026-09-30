from flask import Blueprint, jsonify

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