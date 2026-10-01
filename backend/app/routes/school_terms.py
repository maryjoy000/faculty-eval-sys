from flask import Blueprint, request, jsonify
from flask_login import current_user

from ..extensions import db
from ..models.school_term import SchoolTerm, TERM_STATUSES, TERM_SEMESTERS
from ..utils.decorators import roles_required
from ..services.activity_service import log_activity

terms_bp = Blueprint("school_terms", __name__)


def _open_term(exclude_id=None):
    query = SchoolTerm.query.filter_by(status="open")
    if exclude_id is not None:
        query = query.filter(SchoolTerm.id != exclude_id)
    return query.first()


@terms_bp.route("", methods=["GET"])
@roles_required("admin", "hr")
def list_terms():
    terms = SchoolTerm.query.order_by(
        SchoolTerm.school_year.desc(),
        SchoolTerm.semester.desc(),
        SchoolTerm.id.desc(),
    ).all()

    return jsonify([t.to_dict() for t in terms]), 200


@terms_bp.route("", methods=["POST"])
@roles_required("admin")
def create_term():
    data = request.get_json(silent=True) or {}

    school_year = (data.get("school_year") or "").strip()
    semester = (data.get("semester") or "").strip()

    if not school_year or not semester:
        return jsonify({
            "error": "school_year and term are required"
        }), 400

    if semester not in TERM_SEMESTERS:
        return jsonify({
            "error": f"term must be one of {list(TERM_SEMESTERS)}"
        }), 400

    existing = SchoolTerm.query.filter_by(
        school_year=school_year,
        semester=semester,
    ).first()

    if existing:
        return jsonify({
            "error": f"Term {school_year} {semester} already exists."
        }), 409

    term = SchoolTerm(
        school_year=school_year,
        semester=semester,
        status="draft",
    )
    db.session.add(term)
    db.session.commit()

    log_activity(
        f"Created school term {term.label}",
        user_id=current_user.id,
    )

    return jsonify(term.to_dict()), 201


@terms_bp.route("/<int:term_id>/open", methods=["PUT"])
@roles_required("admin")
def open_term(term_id):
    term = SchoolTerm.query.get_or_404(term_id)

    if term.status == "open":
        return jsonify(term.to_dict()), 200

    other_open = _open_term(exclude_id=term.id)

    if other_open is not None:
        return jsonify({
            "error": (
                f"Close {other_open.label} first — only one term "
                "may be open at a time."
            )
        }), 400

    term.status = "open"
    db.session.commit()

    log_activity(
        f"Opened school term {term.label}",
        user_id=current_user.id,
    )

    return jsonify(term.to_dict()), 200


@terms_bp.route("/<int:term_id>/close", methods=["PUT"])
@roles_required("admin")
def close_term(term_id):
    term = SchoolTerm.query.get_or_404(term_id)

    if term.status == "closed":
        return jsonify(term.to_dict()), 200

    term.status = "closed"
    db.session.commit()

    log_activity(
        f"Closed school term {term.label} (now historical)",
        user_id=current_user.id,
    )

    return jsonify(term.to_dict()), 200


@terms_bp.route("/<int:term_id>/reopen", methods=["PUT"])
@roles_required("admin")
def reopen_term(term_id):
    term = SchoolTerm.query.get_or_404(term_id)

    if term.status == "open":
        return jsonify(term.to_dict()), 200

    other_open = _open_term(exclude_id=term.id)

    if other_open is not None:
        return jsonify({
            "error": (
                f"Close {other_open.label} first — only one term "
                "may be open at a time."
            )
        }), 400

    if term.status not in TERM_STATUSES:
        return jsonify({"error": "Term has an unknown status"}), 400

    term.status = "open"
    db.session.commit()

    log_activity(
        f"Reopened school term {term.label}",
        user_id=current_user.id,
    )

    return jsonify(term.to_dict()), 200
