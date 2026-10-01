from flask import Blueprint, request, jsonify
from flask_login import current_user

from ..extensions import db
from ..models.school_term import SchoolTerm, TERM_STATUSES, TERM_SEMESTERS
from ..models.evaluation import Evaluation
from ..models.evaluation_period import EvaluationPeriod
from ..models.weighting import EvaluationWeighting
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
        user_id=current_user.id
    )

    return jsonify(term.to_dict()), 200


@terms_bp.route("/<int:term_id>/archive", methods=["PUT"])
@roles_required("admin")
def archive_term(term_id):
    term = SchoolTerm.query.get_or_404(term_id)

    if term.status == "archived":
        return jsonify(term.to_dict()), 200

    if term.status == "open":
        return jsonify({
            "error": (
                f"End {term.label} first — only draft or closed "
                "terms may be archived."
            )
        }), 400

    term.status = "archived"
    db.session.commit()

    log_activity(
        f"Archived school term {term.label}",
        user_id=current_user.id
    )

    return jsonify(term.to_dict()), 200


@terms_bp.route("/<int:term_id>", methods=["DELETE"])
@roles_required("admin")
def delete_term(term_id):
    term = SchoolTerm.query.get_or_404(term_id)

    if term.status != "archived":
        return jsonify({
            "error": "Only archived terms may be deleted. Archive it first."
        }), 400

    evaluation_count = (
        Evaluation.query
        .filter_by(term_id=term.id)
        .count()
    )

    if evaluation_count:
        return jsonify({
            "error": (
                f"Cannot delete {term.label} — it still holds "
                f"{evaluation_count} evaluation(s)."
            )
        }), 400

    # Term-scoped configuration goes with the term; real evaluation
    # data (checked above) is never deleted here.
    EvaluationWeighting.query.filter_by(term_id=term.id).delete()
    EvaluationPeriod.query.filter_by(term_id=term.id).delete()

    label = term.label
    db.session.delete(term)
    db.session.commit()

    log_activity(
        f"Deleted school term {label}",
        user_id=current_user.id
    )
    db.session.commit()

    return jsonify({"message": f"Deleted school term {label}."}), 200
