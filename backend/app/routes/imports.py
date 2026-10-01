"""Admin-only historical evaluation bulk import (web UI entry point).

Same engine as backend/import_historical.py (process_rows) — validation
never diverges between the VPS script and this UI. Live submission guards
(period windows, eligibility, duplicates, required comments) are bypassed
by design: backfill writes Evaluation rows directly with an explicit
term_id, exactly like the script.
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
    """Return (rows, options, error_response)."""
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
