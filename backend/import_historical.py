"""
Historical evaluation importer — backfills old records (e.g. 2025-2026 1st/2nd)
for reference/reporting without going through the live submission guards.

Why a script and not POST /api/evaluations:
  - Live API blocks closed terms, requires an open period (students) or an
    open term (peer/HR/classroom), enforces eligibility + duplicates, and
    requires a written comment per submission. None of that fits backfill.
  - This script writes Evaluation (+EvaluationResponse) rows directly with an
    explicit term_id and an optional backdated submitted_at, so terms may stay
    closed/draft while importing.

Usage (from backend/, with the venv active):

    python import_historical.py --file ..\\path\\to\\history.csv --dry-run
    python import_historical.py --file history.csv --no-sentiment --dry-run
    python import_historical.py --file history.csv
    python import_historical.py --generate-templates .\\import_templates

CSV format (first row = headers, case-insensitive, UTF-8):
  Required columns:
    faculty_name, evaluation_type, school_year, semester
  Optional columns:
    comments, submitted_at, overall_average (summary-only mode)
  Plus one column per question_code for detailed mode:
    student:              q1..q33
    peerToPeer:           pr1..pr11
    hrEvaluation:         p1..p8
    classroomObservation: d1q1..d5q6 (whatever is active in YOUR database)

  - evaluation_type: one of student | peerToPeer | hrEvaluation |
    classroomObservation (case-insensitive, surrounding spaces ignored).
  - school_year: YYYY-YYYY with second = first + 1, e.g. 2025-2026.
  - semester: 1st | 2nd | 3rd ("1st Semester" is also accepted).
  - submitted_at: YYYY-MM-DD or full ISO (YYYY-MM-DD HH:MM[:SS]).
    Blank = now.
  - Detailed mode: at least one question column filled -> ALL active
    questions for that type are required (1-5, or the type's scale min-max).
  - Summary mode: no question columns filled -> overall_average (1.00-5.00)
    is required. The Evaluation is stored without responses; the weighted
    overall works but per-question breakdown tabs stay empty for that row.
  - classroomObservation is rating-only: any comments value is dropped
    (same server rule as live submissions).
  - .xlsx is accepted when openpyxl is installed
    (pip install openpyxl); otherwise use .csv.

Safety:
  - --dry-run (default ON when omitted? No — off unless passed) validates
    everything and rolls back so nothing is written. Always dry-run first.
  - Terms are auto-created as `draft` when missing (never auto-opened).
    Pass --no-create-terms to error instead.
  - Faculty rows are NEVER auto-created by default (avoids duplicates like
    "Dela Cruz" vs "dela cruz "). Pass --create-missing-faculty to create
    missing names as Archived (still needs admin review afterward).
  - Sentiment is recomputed for comments via the XLM-R pipeline. If the
    model is unavailable the import continues with sentiment NULL and a
    warning — pass --no-sentiment to skip it deliberately (faster).
  - Exit code 0 = all rows imported. Exit code 1 = at least one row
    failed (valid rows are still committed unless --dry-run).

Examples:
  2025-2026 1st, student, detailed:
    faculty_name,evaluation_type,school_year,semester,q1,q2,...,q33,comments,submitted_at
    "Juana Cruz",student,2025-2026,1st,4,5,...,4,"Magaling magturo",2025-10-15
"""

import argparse
import csv
import os
import re
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

SCHOOL_YEAR_RE = re.compile(r"^(\d{4})-(\d{4})$")
VALID_SEMESTERS = ("1st", "2nd", "3rd")
VALID_EVAL_TYPES = ("student", "peerToPeer", "hrEvaluation", "classroomObservation")

# Lowercase alias -> canonical code (evaluation_type column is case-insensitive).
EVAL_TYPE_ALIASES = {
    "student": "student",
    "classroomobservation": "classroomObservation",
    "classroom_observation": "classroomObservation",
    "classroom observation": "classroomObservation",
    "peertopeer": "peerToPeer",
    "peer_to_peer": "peerToPeer",
    "peer-to-peer": "peerToPeer",
    "peer": "peerToPeer",
    "hrevaluation": "hrEvaluation",
    "hr_evaluation": "hrEvaluation",
    "hr": "hrEvaluation",
}


# ---------------------------------------------------------------------------
# Pure helpers (importable + unit-tested without a database).
# ---------------------------------------------------------------------------

def normalize_header(name):
    """Lowercase + strip a CSV header for case-insensitive matching."""
    return (name or "").strip().lower()


def normalize_name(name):
    """Collapse whitespace + casefold for faculty matching.

    "  Dela   Cruz " -> "dela cruz". Used for both DB rows and CSV values
    so "Dela Cruz" and "dela cruz " match without creating duplicates.
    """
    return re.sub(r"\s+", " ", (name or "").strip()).casefold()


def normalize_semester(raw):
    """Accept '1st' or '1st Semester' (any case) -> '1st'/'2nd'/'3rd'."""
    text = (raw or "").strip()
    text = re.sub(r"\s*semester\s*$", "", text, flags=re.IGNORECASE).strip()
    low = text.lower()
    for valid in VALID_SEMESTERS:
        if low == valid.lower():
            return valid
    return None


def validate_school_year(raw):
    """Return canonical 'YYYY-YYYY' or None when invalid.

    Requires second year = first year + 1 (so '2025-2026' passes,
    '2025-2027' or '2025/2026' fails).
    """
    text = (raw or "").strip()
    match = SCHOOL_YEAR_RE.match(text)
    if not match:
        return None
    first, second = int(match.group(1)), int(match.group(2))
    if second != first + 1:
        return None
    return f"{first:04d}-{second:04d}"


def normalize_eval_type(raw):
    """Map a free-typed evaluation_type cell to its canonical code."""
    key = re.sub(r"\s+", " ", (raw or "").strip()).lower().replace("_", "_")
    # Keep underscores for alias lookup, collapse other separators to nothing
    # for the main lookup (e.g. "Peer-to-Peer" -> "peertopeer").
    nospace = re.sub(r"[\s\-]+", "", key)
    if nospace in EVAL_TYPE_ALIASES:
        return EVAL_TYPE_ALIASES[nospace]
    if key in EVAL_TYPE_ALIASES:
        return EVAL_TYPE_ALIASES[key]
    return None


def parse_submitted_at(raw, now=None):
    """Parse YYYY-MM-DD or ISO datetime. Blank -> now. Returns (dt, error)."""
    now = now or datetime.now(timezone.utc).replace(tzinfo=None)
    text = (raw or "").strip()
    if not text:
        return now, None
    # Accept a space separator ("2025-10-15 09:30") as well as "T".
    candidate = text.replace("Z", "").strip()
    try:
        if re.match(r"^\d{4}-\d{2}-\d{2}$", candidate):
            return datetime.strptime(candidate, "%Y-%m-%d"), None
        return datetime.fromisoformat(candidate.replace("T", " ")), None
    except ValueError:
        return None, (
            f"submitted_at '{raw}' must be YYYY-MM-DD or ISO datetime "
            "(e.g. 2025-10-15 or 2025-10-15 09:30:00)"
        )


def parse_rating(raw, scale_min, scale_max, question_code):
    """Parse one rating cell. Blank -> (None, 'missing')."""
    text = (raw or "").strip() if raw is not None else ""
    if text == "":
        return None, "missing"
    # Accept "4" and "4.0" but ratings are integers on the scale.
    try:
        value = int(float(text)) if "." in text else int(text)
    except (TypeError, ValueError):
        return None, f"'{raw}' is not a number"
    if isinstance(value, bool) or not (scale_min <= value <= scale_max):
        return None, f"{value} is outside {scale_min}-{scale_max}"
    # Reject "4.5": float text that is not a whole number.
    try:
        if "." in text and float(text) != value:
            return None, f"'{raw}' must be a whole number {scale_min}-{scale_max}"
    except ValueError:
        return None, f"'{raw}' is not a number"
    return value, None


def compute_pct(overall_average, scale_max):
    return round((float(overall_average) / float(scale_max)) * 100, 2)


# ---------------------------------------------------------------------------
# File reading (CSV stdlib + optional openpyxl for .xlsx).
# ---------------------------------------------------------------------------

def read_rows(path):
    """Return (headers, rows) where rows is a list of dicts (1-indexed later).

    headers are the raw header strings as found in the file. Row dict keys
    are normalized (lowercased) headers; values are raw cell strings with
    None for empty xlsx cells.
    """
    ext = os.path.splitext(path)[1].lower()
    if ext == ".xlsx":
        try:
            import openpyxl  # noqa: F401
        except ImportError:
            raise SystemExit(
                "ERROR: .xlsx needs openpyxl (pip install openpyxl) "
                "or save the file as .csv and retry."
            )
        from openpyxl import load_workbook
        wb = load_workbook(path, read_only=True, data_only=True)
        ws = wb.active
        iterator = ws.iter_rows(values_only=True)
        try:
            raw_headers = next(iterator)
        except StopIteration:
            return [], []
        headers = [
            "" if h is None else str(h)
            for h in raw_headers
        ]
        norm = [normalize_header(h) for h in headers]
        rows = []
        for values in iterator:
            # Skip fully blank rows (common at the end of Excel sheets).
            if all(v is None or str(v).strip() == "" for v in values):
                continue
            row = {}
            for i, key in enumerate(norm):
                if not key:
                    continue
                v = values[i] if i < len(values) else None
                row[key] = "" if v is None else str(v)
            # Keep the raw header names for error messages.
            rows.append(row)
        return headers, rows

    if ext != ".csv":
        raise SystemExit(f"ERROR: unsupported file type '{ext}' (use .csv or .xlsx).")

    with open(path, "r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            return [], []
        headers = list(reader.fieldnames)
        norm_names = [normalize_header(h) for h in headers]
        # Detect duplicate headers after normalization (e.g. "Q1" + "q1").
        seen = set()
        dupes = set()
        for name in norm_names:
            if name and name in seen:
                dupes.add(name)
            seen.add(name)
        if dupes:
            raise SystemExit(
                "ERROR: duplicate columns after case-normalizing: "
                + ", ".join(sorted(dupes))
            )
        rows = []
        for record in reader:
            # Skip fully blank lines.
            if all((v or "").strip() == "" for v in record.values()):
                continue
            rows.append({
                norm_names[i]: (record[headers[i]] if record[headers[i]] is not None else "")
                for i in range(len(headers))
                if norm_names[i]
            })
        return headers, rows


# ---------------------------------------------------------------------------
# DB-backed import (needs the Flask app context).
# ---------------------------------------------------------------------------

def _scale_bounds(scale_row):
    """Derive (min, max) ints from a RatingScale row, fallback (1, 5)."""
    try:
        values = [int(item["value"]) for item in (scale_row.scale_labels or [])]
        if values:
            return min(values), max(values)
    except (KeyError, TypeError, ValueError):
        pass
    return 1, 5


def _build_lookups():
    """Load question codes, scales, faculty, and terms from the live DB."""
    from app.extensions import db  # noqa: F401 (ensures app context use)
    from app.models.criteria import EvaluationCriteria, EvaluationQuestion
    from app.models.evaluation_type import EvaluationType
    from app.models.faculty import Faculty
    from app.models.rating_scale import RatingScale
    from app.models.school_term import SchoolTerm

    types_by_code = {et.code: et for et in EvaluationType.query.all()}
    missing_types = [c for c in VALID_EVAL_TYPES if c not in types_by_code]
    if missing_types:
        raise SystemExit(
            "ERROR: database is missing evaluation_types: "
            + ", ".join(missing_types)
            + ". Run: python seed.py"
        )

    questions_by_type = {}
    for code, et in types_by_code.items():
        if code not in VALID_EVAL_TYPES:
            continue
        questions = (
            EvaluationQuestion.query
            .join(EvaluationCriteria)
            .filter(
                EvaluationCriteria.evaluation_type_id == et.id,
                EvaluationQuestion.is_active.is_(True),
            )
            .order_by(EvaluationCriteria.part_number, EvaluationQuestion.display_order)
            .all()
        )
        questions_by_type[code] = {q.question_code: q for q in questions}

    scales = {}
    for code, et in types_by_code.items():
        if code not in VALID_EVAL_TYPES:
            continue
        row = RatingScale.query.filter_by(evaluation_type_id=et.id).first()
        scales[code] = _scale_bounds(row) if row else (1, 5)

    faculty_by_norm = {}
    ambiguous = set()
    for faculty in Faculty.query.all():
        key = normalize_name(faculty.name)
        if key in faculty_by_norm:
            ambiguous.add(key)
        faculty_by_norm.setdefault(key, faculty)

    terms_by_key = {}
    for term in SchoolTerm.query.all():
        terms_by_key[(term.school_year, term.semester)] = term

    return {
        "types_by_code": types_by_code,
        "questions_by_type": questions_by_type,
        "scales": scales,
        "faculty_by_norm": faculty_by_norm,
        "ambiguous_faculty": ambiguous,
        "terms_by_key": terms_by_key,
    }


def _get_or_create_term(school_year, semester, terms_by_key, create_terms):
    from app.models.school_term import SchoolTerm
    from app.extensions import db

    key = (school_year, semester)
    term = terms_by_key.get(key)
    if term is not None:
        return term, False, None
    if not create_terms:
        return None, False, (
            f"term {school_year} {semester} does not exist "
            "(create it in System Management or pass --create-terms)"
        )
    term = SchoolTerm(school_year=school_year, semester=semester, status="draft")
    db.session.add(term)
    db.session.flush()  # assigns .id without committing
    terms_by_key[key] = term
    return term, True, None


def _normalize_input_row(row):
    """Normalize one raw row dict to {lowercased_header: str_value}.

    File readers already normalize, but API payloads may carry original
    header casing or numeric cells — normalizing here keeps a single
    source of truth for both entry points.
    """
    normalized = {}
    for key, value in (row or {}).items():
        norm_key = normalize_header(key)
        if not norm_key:
            continue
        normalized[norm_key] = "" if value is None else str(value)
    return normalized


def process_rows(rows, source_label="upload", dry_run=False, create_terms=True,
                 create_missing_faculty=False, no_sentiment=False,
                 skip_exact_duplicates=False, verbose=True, actor_user_id=None,
                 target_term_id=None):
    """Validate + insert already-parsed rows. Returns a summary dict.

    `rows` is a list of dicts (any header casing; values may be numbers).
    Used by both the CLI (run_import below) and the admin UI bulk-import
    API so validation never diverges between the two. Prints progress
    only when verbose=True; warnings are always collected in the summary.
    `actor_user_id` attributes the audit entry (web UI passes the admin's
    id; the CLI leaves it None = system import).
    `target_term_id` forces every row into one existing term (the UI term
    picker / --target-term-id); per-row school_year/semester columns are
    then ignored and may be blank. When None, each row's own columns decide
    (auto-creating missing terms as drafts when create_terms is set).
    """
    from app.extensions import db
    from app.models.evaluation import Evaluation, EvaluationResponse
    from app.models.faculty import Faculty
    from app.utils.evaluation_rules import sanitize_comments
    from app.services.activity_service import log_activity

    rows = [_normalize_input_row(row) for row in (rows or [])]
    # Skip fully blank rows (common at the end of spreadsheets).
    rows = [row for row in rows if any((v or "").strip() != "" for v in row.values())]
    if not rows:
        if verbose:
            print("No data rows found — nothing to do.")
        return {"inserted": 0, "skipped": 0, "terms_created": 0,
                "faculty_created": 0, "errors": [], "warnings": []}

    # Single-destination mode: every row lands in this term; the per-row
    # school_year/semester columns are ignored (callers pre-validated it).
    override_term = None
    if target_term_id is not None:
        from app.models.school_term import SchoolTerm
        override_term = SchoolTerm.query.get(int(target_term_id))
        if override_term is None:
            raise RuntimeError(
                f"Target school term #{target_term_id} not found. "
                "Create it in System Management first."
            )

    lookups = _build_lookups()
    types_by_code = lookups["types_by_code"]
    questions_by_type = lookups["questions_by_type"]
    scales = lookups["scales"]
    faculty_by_norm = lookups["faculty_by_norm"]
    ambiguous = lookups["ambiguous_faculty"]
    terms_by_key = lookups["terms_by_key"]

    # Lazily imported: avoids pulling torch/transformers unless needed.
    sentiment_fn = None
    sentiment_failed = False
    warnings = []
    if not no_sentiment:
        try:
            from app.utils.sentiment import analyze_sentiment as _fn
            sentiment_fn = _fn
        except Exception as exc:  # missing deps, no model on disk, etc.
            warnings.append(f"sentiment disabled ({exc}); storing NULL scores.")
            if verbose:
                print(f"WARNING: sentiment disabled ({exc}); storing NULL scores.")
            sentiment_fn = None
            sentiment_failed = True

    inserted = 0
    skipped = 0
    terms_created = 0
    faculty_created = 0
    row_errors = []
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    for index, row in enumerate(rows, start=2):  # +2: header is row 1
        tag = f"row {index}"
        try:
            faculty_raw = (row.get("faculty_name") or "").strip()
            type_raw = (row.get("evaluation_type") or "").strip()
            year_raw = (row.get("school_year") or "").strip()
            sem_raw = (row.get("semester") or "").strip()

            if not faculty_raw:
                raise ValueError("faculty_name is required")
            type_code = normalize_eval_type(type_raw)
            if type_code is None:
                raise ValueError(
                    f"evaluation_type '{type_raw}' must be one of "
                    "student | peerToPeer | hrEvaluation | classroomObservation"
                )
            if override_term is not None:
                # Destination picked up front (UI term picker) — file
                # columns are ignored and may be blank.
                school_year = override_term.school_year
                semester = override_term.semester
            else:
                school_year = validate_school_year(year_raw)
                if school_year is None:
                    raise ValueError(
                        f"school_year '{year_raw}' must look like 2025-2026 "
                        "(second year = first year + 1)"
                    )
                semester = normalize_semester(sem_raw)
                if semester is None:
                    raise ValueError(
                        f"semester '{sem_raw}' must be 1st, 2nd, or 3rd"
                    )

            # --- Faculty ---
            faculty_key = normalize_name(faculty_raw)
            if faculty_key in ambiguous:
                raise ValueError(
                    f"faculty_name '{faculty_raw}' matches more than one "
                    "faculty row — use the exact full name"
                )
            faculty = faculty_by_norm.get(faculty_key)
            if faculty is None:
                if not create_missing_faculty:
                    raise ValueError(
                        f"faculty '{faculty_raw}' not found — create it in "
                        "Faculty Management first (or pass "
                        "--create-missing-faculty)"
                    )
                faculty = Faculty(name=faculty_raw.strip(), status="Archived")
                db.session.add(faculty)
                db.session.flush()
                faculty_by_norm[faculty_key] = faculty
                faculty_created += 1

            # --- Term (never auto-opened: historical rows attach by id) ---
            if override_term is not None:
                term, was_created, term_error = override_term, False, None
            else:
                term, was_created, term_error = _get_or_create_term(
                    school_year, semester, terms_by_key, create_terms
                )
            if term_error:
                raise ValueError(term_error)
            if was_created:
                terms_created += 1

            # --- Ratings vs summary mode ---
            expected = questions_by_type[type_code]
            scale_min, scale_max = scales[type_code]
            ratings = {}
            missing = []
            invalid = []
            has_any_rating = False
            for code in expected:
                raw_val = row.get(code.lower(), "")
                # Headers were lowercased on read; question codes are
                # already lowercase (q1, p1, pr1, d1q1), so this matches
                # "Q1" and "q1" alike.
                text = (raw_val or "").strip()
                if text != "":
                    has_any_rating = True
                value, problem = parse_rating(raw_val, scale_min, scale_max, code)
                if problem == "missing":
                    missing.append(code)
                elif problem:
                    invalid.append(f"{code}: {problem}")
                else:
                    ratings[code] = value

            overall_average = None
            if has_any_rating:
                if missing or invalid:
                    details = []
                    if missing:
                        details.append(f"missing {len(missing)}: {', '.join(sorted(missing)[:8])}"
                                       + ("..." if len(missing) > 8 else ""))
                    if invalid:
                        details.append("invalid: " + "; ".join(invalid[:4]))
                    raise ValueError(
                        "incomplete ratings for "
                        f"{type_code} (needs all {len(expected)} questions): "
                        + " | ".join(details)
                    )
                overall_average = sum(ratings.values()) / len(ratings)
            else:
                overall_raw = (row.get("overall_average") or "").strip()
                if overall_raw == "":
                    raise ValueError(
                        f"no ratings found — fill all {len(expected)} question "
                        f"columns ({', '.join(sorted(expected)[:5])}...) or "
                        "provide overall_average for summary mode"
                    )
                try:
                    overall_average = float(overall_raw)
                except ValueError:
                    raise ValueError(
                        f"overall_average '{overall_raw}' must be a number "
                        f"{scale_min}.00-{scale_max}.00"
                    )
                if not (scale_min <= overall_average <= scale_max):
                    raise ValueError(
                        f"overall_average {overall_average} is outside "
                        f"{scale_min}-{scale_max}"
                    )

            # --- Comments + sentiment (classroom = rating-only, always None) ---
            raw_comments = row.get("comments", "")
            comments = sanitize_comments(
                type_code,
                raw_comments if (raw_comments or "").strip() != "" else None,
            )
            if type_code == "classroomObservation" and (raw_comments or "").strip():
                warnings.append(
                    f"{tag}: comments dropped (classroomObservation is rating-only).")
                if verbose:
                    print(f"  {tag}: note — comments dropped (classroomObservation is rating-only).")
            if comments is not None:
                comments = comments.strip() or None

            sentiment_label = None
            sentiment_score = None
            if comments and sentiment_fn is not None and not sentiment_failed:
                try:
                    result = sentiment_fn(comments)
                    if result:
                        sentiment_label = str(result.get("label", "")).lower() or None
                        sentiment_score = float(result.get("score"))
                except Exception as exc:
                    warnings.append(
                        f"{tag}: sentiment failed ({exc}); storing NULL.")
                    if verbose:
                        print(f"  {tag}: warning — sentiment failed ({exc}); storing NULL.")
                    sentiment_failed = True  # warn once, keep importing

            # --- submitted_at ---
            submitted_at, date_error = parse_submitted_at(
                row.get("submitted_at", ""), now=now
            )
            if date_error:
                raise ValueError(date_error)

            # --- Exact-duplicate guard (opt-in only) ---
            if skip_exact_duplicates:
                probe = (
                    Evaluation.query
                    .filter_by(
                        evaluation_type_id=types_by_code[type_code].id,
                        faculty_id=faculty.id,
                        term_id=term.id,
                    )
                    .all()
                )
                norm_comments = (comments or "").strip()
                is_dupe = any(
                    round(float(e.overall_average or 0), 2) == round(float(overall_average), 2)
                    and (e.comments or "").strip() == norm_comments
                    and e.submitted_at is not None
                    and e.submitted_at.replace(microsecond=0) == submitted_at.replace(microsecond=0)
                    for e in probe
                )
                if is_dupe:
                    skipped += 1
                    continue

            evaluation = Evaluation(
                evaluation_type_id=types_by_code[type_code].id,
                faculty_id=faculty.id,
                term_id=term.id,
                evaluator_student_id=None,
                evaluator_faculty_id=None,
                evaluator_user_id=None,
                evaluation_period_id=None,
                submitted_at=submitted_at,
                overall_average=round(float(overall_average), 4),
                overall_rating_pct=compute_pct(overall_average, scale_max),
                comments=comments,
                sentiment_label=sentiment_label,
                sentiment_score=sentiment_score,
            )
            db.session.add(evaluation)
            db.session.flush()

            if has_any_rating:
                for code, value in ratings.items():
                    db.session.add(EvaluationResponse(
                        evaluation_id=evaluation.id,
                        question_id=expected[code].id,
                        rating_value=value,
                    ))
            inserted += 1

        except ValueError as exc:
            row_errors.append(f"{tag}: {exc}")
        except Exception as exc:  # unexpected — still per-row, never abort all
            row_errors.append(f"{tag}: unexpected error: {exc}")

    # One audit entry for the whole batch (user_id None = system import;
    # the web UI passes the admin's id for attribution).
    if inserted and not dry_run:
        log_activity(
            f"Imported historical evaluations from {source_label}: "
            f"{inserted} inserted"
            + (f", {skipped} skipped" if skipped else "")
            + (f", {terms_created} term(s) created" if terms_created else ""),
            user_id=actor_user_id,
        )

    if dry_run:
        db.session.rollback()
        if verbose:
            print(f"DRY-RUN: rolled back ({inserted} would be inserted).")
    else:
        db.session.commit()

    if verbose:
        print(f"Terms created: {terms_created} | Faculty created: {faculty_created}")
        print(f"Inserted: {inserted} | Skipped: {skipped} | Errors: {len(row_errors)}")
        for message in row_errors[:30]:
            print(f"  ERROR {message}")
        if len(row_errors) > 30:
            print(f"  ... and {len(row_errors) - 30} more (see full output)")

    return {
        "inserted": inserted,
        "skipped": skipped,
        "terms_created": terms_created,
        "faculty_created": faculty_created,
        "errors": row_errors,
        "warnings": warnings,
    }


def run_import(path, dry_run=False, create_terms=True,
               create_missing_faculty=False, no_sentiment=False,
               skip_exact_duplicates=False, target_term_id=None):
    """Validate + insert every row from a CSV/XLSX file.

    Thin CLI wrapper around process_rows (single source of truth shared
    with the admin UI bulk-import API). Returns a summary dict.
    """
    _, rows = read_rows(path)
    return process_rows(
        rows,
        source_label=os.path.basename(path),
        dry_run=dry_run,
        create_terms=create_terms,
        create_missing_faculty=create_missing_faculty,
        no_sentiment=no_sentiment,
        skip_exact_duplicates=skip_exact_duplicates,
        target_term_id=target_term_id,
        verbose=True,
    )


def generate_templates(out_dir):
    """Write one XLSX template per evaluation type using the LIVE question set.

    Falls back to CSV when openpyxl is not installed.
    """
    from app.models.school_term import TERM_SEMESTERS  # noqa: F401 (validates env)

    lookups = _build_lookups()
    questions_by_type = lookups["questions_by_type"]
    os.makedirs(out_dir, exist_ok=True)
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Alignment, Font, PatternFill
        from openpyxl.utils import get_column_letter
        use_xlsx = True
    except ImportError:
        print("WARNING: openpyxl not installed — writing CSV instead "
              "(pip install openpyxl for XLSX).")
        use_xlsx = False
    examples = {
        "student": ("Dela Cruz, Juan", "2025-2026", "1st", "Magaling magturo at laging on time.", "2025-10-15"),
        "peerToPeer": ("Reyes, Maria", "2025-2026", "1st", "Great collaborator.", "2025-11-02"),
        "hrEvaluation": ("Santos, Jose", "2025-2026", "2nd", "Submitted all requirements on time.", "2026-03-10"),
        "classroomObservation": ("Dela Cruz, Juan", "2025-2026", "1st", "", "2025-09-20"),
    }
    written = []
    for type_code in VALID_EVAL_TYPES:
        codes = sorted(questions_by_type[type_code].keys())
        faculty, year, sem, comments, submitted = examples[type_code]
        header = (["faculty_name", "evaluation_type", "school_year", "semester"]
                  + codes + ["comments", "submitted_at", "overall_average"])
        example = ([faculty, type_code, year, sem]
                   + ["4"] * len(codes) + [comments, submitted, ""])
        if use_xlsx:
            filename = f"template_{type_code}_2025-2026.xlsx"
            full = os.path.join(out_dir, filename)
            wb = Workbook()
            ws = wb.active
            ws.title = "Historical"
            ws.append(header)
            ws.append(example)
            header_fill = PatternFill("solid", fgColor="1F4E79")
            header_font = Font(bold=True, color="FFFFFF", size=10)
            for col in range(1, len(header) + 1):
                cell = ws.cell(row=1, column=col)
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = Alignment(horizontal="center", vertical="center",
                                           wrap_text=True)
            ws.freeze_panes = "A2"
            ws.auto_filter.ref = ws.dimensions
            for idx, name in enumerate(header, start=1):
                low = name.lower()
                if low in ("faculty_name", "comments"):
                    width = 28
                elif low in ("evaluation_type", "submitted_at", "overall_average"):
                    width = 18
                elif low in ("school_year", "semester"):
                    width = 14
                else:
                    width = 9
                ws.column_dimensions[get_column_letter(idx)].width = width
            wb.save(full)
        else:
            filename = f"template_{type_code}_2025-2026.csv"
            full = os.path.join(out_dir, filename)
            with open(full, "w", encoding="utf-8", newline="") as handle:
                writer = csv.writer(handle)
                writer.writerow(header)
                writer.writerow(example)
        written.append(full)
        print(f"Wrote {full} ({len(codes)} question columns)")
    notes = os.path.join(out_dir, "README_IMPORT.txt")
    with open(notes, "w", encoding="utf-8") as handle:
        handle.write(
            "Historical import templates (generated from YOUR database question set).\n"
            "Fill one row per old evaluation. Keep the header row exactly.\n"
            "faculty_name must match Faculty Management exactly (case-insensitive).\n"
            "school_year like 2025-2026, semester 1st/2nd/3rd.\n"
            "Detailed: fill EVERY question column (1-5). Summary: leave questions\n"
            "blank and fill overall_average instead (breakdown tabs stay empty).\n"
            "Run: python import_historical.py --file <template.xlsx> --dry-run\n"
            "Then: python import_historical.py --file <template.xlsx>\n"
        )
    written.append(notes)
    return written


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Import historical evaluations (e.g. 2025-2026) from CSV/XLSX."
    )
    parser.add_argument("--file", help="CSV or XLSX file to import")
    parser.add_argument("--dry-run", action="store_true",
                        help="validate everything, write nothing")
    parser.add_argument("--no-create-terms", action="store_true",
                        help="error on unknown terms instead of creating drafts")
    parser.add_argument("--create-missing-faculty", action="store_true",
                        help="create unknown faculty as Archived (default: error)")
    parser.add_argument("--no-sentiment", action="store_true",
                        help="skip XLM-R sentiment (stores NULL, much faster)")
    parser.add_argument("--skip-exact-duplicates", action="store_true",
                        help="skip rows identical to an existing evaluation")
    parser.add_argument("--target-term-id", type=int, default=None,
                        help="force every row into this school term id "
                             "(per-row school_year/semester ignored)")
    parser.add_argument("--generate-templates",
                        help="write per-type XLSX templates into DIR and exit")
    args = parser.parse_args(argv)

    from app import create_app
    app = create_app()
    with app.app_context():
        if args.generate_templates:
            generate_templates(args.generate_templates)
            return 0
        if not args.file:
            parser.error("--file is required (or use --generate-templates DIR)")
        if not os.path.isfile(args.file):
            parser.error(f"file not found: {args.file}")
        summary = run_import(
            args.file,
            dry_run=args.dry_run,
            create_terms=not args.no_create_terms,
            create_missing_faculty=args.create_missing_faculty,
            no_sentiment=args.no_sentiment,
            skip_exact_duplicates=args.skip_exact_duplicates,
            target_term_id=args.target_term_id,
        )
        return 1 if summary["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
