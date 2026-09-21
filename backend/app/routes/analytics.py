from flask import Blueprint, jsonify

from ..utils.decorators import roles_required
from ..services.analytics_service import get_analytics_overview

analytics_bp = Blueprint("analytics", __name__)


@analytics_bp.route("/overview", methods=["GET"])
@roles_required("admin")
def overview():
    return jsonify(get_analytics_overview()), 200