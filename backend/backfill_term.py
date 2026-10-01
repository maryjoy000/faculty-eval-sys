"""
Move unscoped evaluations (term_id IS NULL — the rows you only see under
"All history") into one school term, e.g. 2026-2027 1st.

Dry-run by default: prints the count, date range, and per-type breakdown
of the rows it WOULD move, and changes nothing. Pass --confirm to apply.

Usage (from backend/, with the venv active):

    python backfill_term.py --school-year 2026-2027 --semester 1st
    python backfill_term.py --school-year 2026-2027 --semester 1st --confirm

Optional date guard (only move rows submitted inside a window):

    python backfill_term.py --school-year 2026-2027 --semester 1st \
        --submitted-after 2026-06-01 --submitted-before 2026-10-01 --confirm

Safety:
  - Target term must already exist (create/open it first with
    open_school_term.py or System Management). Never auto-created here.
  - Only rows with term_id IS NULL are touched. Rows already tagged to
    another term are never moved.
  - "All history" will still include the moved rows — it is the union of
    every term by design. What changes is they now ALSO appear under the
    2026-2027 1st filter.
  - Moved rows use the target term's weighting (or the global default when
    the term has no override) instead of the legacy unscoped weighting.
  - Back up first: mysqldump -u fes_user -p fes > backup.sql
"""

import argparse
import os
import re
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

SCHOOL_YEAR_RE = re.compile(r"^(\d{4})-(\d{4})$")
VALID_SEMESTERS = ("1st", "2nd", "3rd")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Move unscoped evaluations into a term (dry-run unless --confirm)."
    )
    parser.add_argument("--school-year", required=True,
                        help="e.g. 2026-2027 (must already exist)")
    parser.add_argument("--semester", required=True,
                        help="1st, 2nd, or 3rd")
    parser.add_argument("--submitted-after", default=None,
                        help="only rows submitted on/after YYYY-MM-DD")
    parser.add_argument("--submitted-before", default=None,
                        help="only rows submitted on/before YYYY-MM-DD")
    parser.add_argument("--confirm", action="store_true",
                        help="actually write to the database")
    return parser.parse_args(argv)


def validate_inputs(school_year_raw, semester_raw,
                    submitted_after_raw, submitted_before_raw):
    school_year = (school_year_raw or "").strip()
    match = SCHOOL_YEAR_RE.match(school_year)
    if not match:
        raise SystemExit(
            f"ERROR: school_year '{school_year_raw}' must look like 2026-2027."
        )
    first, second = int(match.group(1)), int(match.group(2))
    if second != first + 1:
        raise SystemExit(
            f"ERROR: school_year '{school_year}' is not consecutive."
        )
    semester = re.sub(r"\s*semester\s*$", "", (semester_raw or "").strip(),
                      flags=re.IGNORECASE).strip().lower()
    canonical_semester = None
    for valid in VALID_SEMESTERS:
        if semester == valid.lower():
            canonical_semester = valid
    if canonical_semester is None:
        raise SystemExit(
            f"ERROR: semester '{semester_raw}' must be 1st, 2nd, or 3rd."
        )
    after = before = None
    for label, raw in (("submitted-after", submitted_after_raw),
                       ("submitted-before", submitted_before_raw)):
        if raw is None or str(raw).strip() == "":
            continue
        text = str(raw).strip()
        if not DATE_RE.match(text):
            raise SystemExit(
                f"ERROR: --{label} '{raw}' must be YYYY-MM-DD."
            )
        try:
            parsed = datetime.strptime(text, "%Y-%m-%d")
        except ValueError:
            raise SystemExit(
                f"ERROR: --{label} '{raw}' is not a real calendar date."
            )
        if label == "submitted-after":
            after = parsed
        else:
            before = parsed.replace(hour=23, minute=59, second=59)
    if after is not None and before is not None and after > before:
        raise SystemExit(
            "ERROR: --submitted-after is later than --submitted-before."
        )
    return f"{first:04d}-{second:04d}", canonical_semester, after, before


def find_candidates(after, before):
    """Unscoped evaluations, optionally inside a submitted_at window."""
    from app.models.evaluation import Evaluation

    query = Evaluation.query.filter(Evaluation.term_id.is_(None))
    if after is not None:
        query = query.filter(Evaluation.submitted_at >= after)
    if before is not None:
        query = query.filter(Evaluation.submitted_at <= before)
    return query.order_by(Evaluation.submitted_at).all()


def describe(candidates):
    """(count, oldest, newest, per_type_counts) for dry-run output."""
    from app.models.evaluation_type import EvaluationType

    type_labels = {et.id: et.code for et in EvaluationType.query.all()}
    per_type = {}
    dates = [e.submitted_at for e in candidates if e.submitted_at]
    for evaluation in candidates:
        code = type_labels.get(evaluation.evaluation_type_id, "unknown")
        per_type[code] = per_type.get(code, 0) + 1
    oldest = min(dates) if dates else None
    newest = max(dates) if dates else None
    return len(candidates), oldest, newest, per_type


def main(argv=None):
    args = parse_args(argv)
    school_year, semester, after, before = validate_inputs(
        args.school_year, args.semester,
        args.submitted_after, args.submitted_before,
    )

    from app import create_app
    app = create_app()
    with app.app_context():
        from app.extensions import db
        from app.models.school_term import SchoolTerm
        from app.services.activity_service import log_activity

        term = SchoolTerm.query.filter_by(
            school_year=school_year, semester=semester).first()
        if term is None:
            print(f"ERROR: term {school_year} {semester} does not exist. "
                  "Create/open it first (open_school_term.py).")
            return 1

        candidates = find_candidates(after, before)
        count, oldest, newest, per_type = describe(candidates)

        print(f"Target: {term.label} (status: {term.status})")
        print(f"Unscoped rows matching: {count}")
        if count:
            print(f"  date range: {oldest} .. {newest}")
            for code in sorted(per_type):
                print(f"  {code}: {per_type[code]}")

        if not count:
            print("Nothing to move.")
            return 0

        if not args.confirm:
            print("DRY-RUN: nothing was written. Re-run with --confirm to apply.")
            return 0

        for evaluation in candidates:
            evaluation.term_id = term.id
        log_activity(
            f"Moved {count} unscoped evaluation(s) into {term.label}",
            user_id=None,
        )
        db.session.commit()
        print(f"Moved {count} row(s) into {term.label}. "
              "They now appear under that term's filter (and still in All history).")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
