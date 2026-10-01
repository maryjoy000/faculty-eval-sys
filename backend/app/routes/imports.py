"""Admin-only historical evaluation bulk import/export (web UI entry points).

Import uses the same engine as backend/import_historical.py (process_rows)
— validation never diverges between the VPS script and this UI. Live
submission guards (period windows, eligibility, duplicates, required
comments) are bypassed by design: backfill writes Evaluation rows directly
with an explicit term_id, exactly like the script.

Export returns one term's evaluations as import-compatible rows, so an
exported file can be edited and re-imported without reformatting.
"""
import importlib.util
import os

from flask import Blueprint, request, jsonify
from flask_login import current_user

from ..utils.decorators import roles_required

imports_bp = Blueprint("imports", __name__)

#: Per-request safety cap (one spreadsheet is typically a few hundred rows).
MAX_ROWS_PER_REQUEST = 2000


def _load_import_engine():
    """Load backend/import_historical.py by file path (it lives outside the
    app package, so a plain `import import_historical` would depend on
    sys.path containing backend/)."""
    engine_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "import_historical.py",
    )
    spec = importlib.util.spec_from_file_location("historical_import_engine", engine_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Historical import engine not found on disk.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _parse_payload():
    """Return (rows, parsed, error_response)."""
    data = request.get_json(silent=True) or {}
    rows = data.get("rows")
    if not isinstance(rows, list) or not rows:
        return None, None, (jsonify({"error": "rows must be a non-empty list"}), 400)
    if len(rows) > MAX_ROWS_PER_REQUEST:
        return None, None, (jsonify({
            "error": f"Too many rows ({len(rows)}). Split into batches of "
                     f"{MAX_ROWS_PER_REQUEST} or fewer."
        }), 400)
    for index, row in enumerate(rows, start=2):
        if not isinstance(row, dict):
            return None, None, (jsonify({
                "error": f"row {index} must be an object of column values"
            }), 400)

    raw_options = data.get("options") or {}
    if not isinstance(raw_options, dict):
        return None, None, (jsonify({"error": "options must be an object"}), 400)
    options = {
        "create_terms": bool(raw_options.get("create_terms", True)),
        "create_missing_faculty": bool(raw_options.get("create_missing_faculty", False)),
        # Web default skips the ~1GB XLM-R load for speed; the checkbox
        # "Compute sentiment" flips this to False when wanted.
        "no_sentiment": bool(raw_options.get("no_sentiment", True)),
        "skip_exact_duplicates": bool(raw_options.get("skip_exact_duplicates", False)),
    }
    source_label = str(data.get("filename") or "web upload").strip() or "web upload"

    # Optional single-destination term (UI term picker): every row lands
    # here and per-row school_year/semester columns are ignored. Validated
    # here so a bad id is a clean 400/404, never a 500 from the engine.
    target_term_id = data.get("target_term_id")
    if target_term_id is not None and str(target_term_id).strip() != "":
        try:
            target_term_id = int(target_term_id)
        except (TypeError, ValueError):
            return None, None, (jsonify({"error": "target_term_id must be an integer"}), 400)
        from ..models.school_term import SchoolTerm
        if SchoolTerm.query.get(target_term_id) is None:
            return None, None, (jsonify({"error": "School term not found"}), 404)
        options["target_term_id"] = target_term_id

    return rows, {"options": options, "source_label": source_label}, None


@imports_bp.route("/historical/validate", methods=["POST"])
@roles_required("admin")
def validate_historical():
    rows, parsed, error = _parse_payload()
    if error:
        return error[0], error[1]
    engine = _load_import_engine()
    try:
        summary = engine.process_rows(
            rows,
            source_label=f"{parsed['source_label']} (validate)",
            dry_run=True,
            verbose=False,
            actor_user_id=None,
            **parsed["options"],
        )
    except (RuntimeError, SystemExit) as exc:
        # Misconfigured database (e.g. seed.py never ran). Never leak a
        # traceback as HTML — the UI renders this message instead.
        detail = exc.code if isinstance(exc, SystemExit) else str(exc)
        return jsonify({"error": str(detail) or "Import engine failed"}), 500
    return jsonify(summary), 200


@imports_bp.route("/historical/commit", methods=["POST"])
@roles_required("admin")
def commit_historical():
    rows, parsed, error = _parse_payload()
    if error:
        return error[0], error[1]
    engine = _load_import_engine()
    try:
        summary = engine.process_rows(
            rows,
            source_label=parsed["source_label"],
            dry_run=False,
            verbose=False,
            actor_user_id=int(current_user.id),
            **parsed["options"],
        )
    except (RuntimeError, SystemExit) as exc:
        detail = exc.code if isinstance(exc, SystemExit) else str(exc)
        return jsonify({"error": str(detail) or "Import engine failed"}), 500
    status = 200 if not summary["errors"] else 207
    return jsonify(summary), status


@imports_bp.route("/historical/export", methods=["GET"])
@roles_required("admin")
def export_historical():
    """Export one term's evaluations as import-compatible rows.

    Query: ?term_id=<id> (required — the UI term selector always sends one).
    Response: {term, headers, rows, count}. Each row mirrors the import
    template columns, so the downloaded file can be edited and re-imported
    as-is. Detailed rows carry per-question ratings (overall_average left
    blank for recompute); summary rows carry overall_average instead.
    """
    from ..models.criteria import EvaluationCriteria, EvaluationQuestion
    from ..models.evaluation import Evaluation
    from ..models.evaluation_type import EvaluationType
    from ..models.faculty import Faculty
    from ..models.school_term import SchoolTerm

    raw_term_id = (request.args.get("term_id") or "").strip()
    if not raw_term_id:
        return jsonify({"error": "term_id is required (pick a school term)"}), 400
    try:
        term_id = int(raw_term_id)
    except (TypeError, ValueError):
        return jsonify({"error": "term_id must be an integer"}), 400

    term = SchoolTerm.query.get(term_id)
    if term is None:
        return jsonify({"error": "School term not found"}), 404

    # Question columns in the same order as the import templates
    # (per-type sorted codes), so export and import stay interchangeable.
    engine = _load_import_engine()
    ordered_codes = []
    for type_code in engine.VALID_EVAL_TYPES:
        evaluation_type = EvaluationType.query.filter_by(code=type_code).first()
        if evaluation_type is None:
            continue
        questions = (
            EvaluationQuestion.query
            .join(EvaluationCriteria)
            .filter(
                EvaluationCriteria.evaluation_type_id == evaluation_type.id,
                EvaluationQuestion.is_active.is_(True),
            )
            .all()
        )
        ordered_codes.extend(sorted({q.question_code for q in questions}))

    headers = (
        ["faculty_name", "evaluation_type", "school_year", "semester"]
        + ordered_codes
        + ["comments", "submitted_at", "overall_average"]
    )

    evaluations = (
        Evaluation.query
        .filter_by(term_id=term.id)
        .order_by(Evaluation.faculty_id, Evaluation.submitted_at)
        .all()
    )

    # One-shot lookups (no per-row queries).
    faculty_names = {f.id: f.name for f in Faculty.query.all()}
    type_codes = {et.id: et.code for et in EvaluationType.query.all()}
    question_codes = {}
    for question in EvaluationQuestion.query.all():
        question_codes[question.id] = question.question_code

    rows = []
    for evaluation in evaluations:
        ratings = {}
        for response in evaluation.responses:
            code = question_codes.get(response.question_id)
            if code is not None:
                ratings[code] = response.rating_value

        detailed = len(ratings) > 0
        row = {
            "faculty_name": faculty_names.get(evaluation.faculty_id, ""),
            "evaluation_type": type_codes.get(evaluation.evaluation_type_id, ""),
            "school_year": term.school_year,
            "semester": term.semester,
        }
        for code in ordered_codes:
            row[code] = ratings.get(code, "")
        row["comments"] = evaluation.comments or ""
        row["submitted_at"] = (
            evaluation.submitted_at.strftime("%Y-%m-%d %H:%M:%S")
            if evaluation.submitted_at else ""
        )
        # Summary-only rows (no per-question responses) keep their stored
        # average; detailed rows leave it blank so import recomputes it.
        row["overall_average"] = (
            "" if detailed
            else (evaluation.overall_average if evaluation.overall_average is not None else "")
        )
        rows.append(row)

    return jsonify({
        "term": term.to_dict(),
        "headers": headers,
        "rows": rows,
        "count": len(rows),
    }), 200
