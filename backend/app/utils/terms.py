"""School-term helpers shared by reporting and submission routes."""
from flask import request, jsonify

from ..models.school_term import SchoolTerm


def resolve_term_param():
    """Read and validate the optional ?term_id= reporting filter.

    Returns (term_id, error) where error is None on success — either a
    validated term id, or None meaning "all history" (legacy behavior).
    Unknown term ids are rejected so typos never silently empty a report.
    """
    raw = request.args.get("term_id", None)

    if raw is None or str(raw).strip() == "":
        return None, None

    try:
        term_id = int(raw)
    except (TypeError, ValueError):
        return None, (jsonify({"error": "term_id must be an integer"}), 400)

    term = SchoolTerm.query.get(term_id)

    if not term:
        return None, (jsonify({"error": "School term not found"}), 404)

    return term.id, None


def resolve_submission_term(period):
    """Determine the term id for a new evaluation submission.

    Linked period's term wins; otherwise the single open term; otherwise
    None (legacy unscoped). Returns (term_id, error) — a closed resolved
    term rejects the submission outright.
    """
    if period is not None and period.term_id is not None:
        term = SchoolTerm.query.get(period.term_id)

        if term and term.status == "closed":
            return None, (jsonify({
                "error": f"The {term.label} evaluation period is closed."
            }), 403)

        if term and term.status == "archived":
            return None, (jsonify({
                "error": f"The {term.label} evaluation period is archived."
            }), 403)

        return period.term_id, None

    open_term = SchoolTerm.query.filter_by(status="open").first()

    if open_term is not None:
        return open_term.id, None

    return None, None
