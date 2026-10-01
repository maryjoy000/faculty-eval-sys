"""
Open a school term (e.g. 2026-2027 1st) from the server terminal.

Dry-run by default: prints exactly what it WOULD do and changes nothing.
Pass --confirm to actually write. Pass --close-open to end the currently
open term first (required — only one term may be open at a time).

Usage (from backend/, with the venv active):

    python open_school_term.py --school-year 2026-2027 --semester 1st
    python open_school_term.py --school-year 2026-2027 --semester 1st --close-open
    python open_school_term.py --school-year 2026-2027 --semester 1st --close-open --confirm

Safety:
  - school_year must look like YYYY-YYYY with second = first + 1
    (so 2026-2027 passes, 2026-207 and 2026/2027 fail loudly).
  - semester must be 1st, 2nd, or 3rd.
  - Without --confirm, the database is never touched (rollback).
  - Closing a term only ends new submissions; its reports stay readable
    and it can be reopened later from System Management.
  - Aborts if more than one term is somehow open (data anomaly — fix
    manually instead of guessing).
"""

import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

SCHOOL_YEAR_RE = re.compile(r"^(\d{4})-(\d{4})$")
VALID_SEMESTERS = ("1st", "2nd", "3rd")


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="Open a school term (dry-run unless --confirm)."
    )
    parser.add_argument("--school-year", required=True,
                        help="e.g. 2026-2027")
    parser.add_argument("--semester", required=True,
                        help="1st, 2nd, or 3rd")
    parser.add_argument("--close-open", action="store_true",
                        help="end the currently open term first")
    parser.add_argument("--confirm", action="store_true",
                        help="actually write to the database")
    return parser.parse_args(argv)


def validate_inputs(school_year_raw, semester_raw):
    school_year = (school_year_raw or "").strip()
    match = SCHOOL_YEAR_RE.match(school_year)
    if not match:
        raise SystemExit(
            f"ERROR: school_year '{school_year_raw}' must look like "
            "2026-2027 (four digits, hyphen, four digits)."
        )
    first, second = int(match.group(1)), int(match.group(2))
    if second != first + 1:
        raise SystemExit(
            f"ERROR: school_year '{school_year}' is not consecutive "
            "(second year must be first year + 1)."
        )
    semester = re.sub(r"\s*semester\s*$", "", (semester_raw or "").strip(),
                      flags=re.IGNORECASE).strip().lower()
    for valid in VALID_SEMESTERS:
        if semester == valid.lower():
            return f"{first:04d}-{second:04d}", valid
    raise SystemExit(
        f"ERROR: semester '{semester_raw}' must be 1st, 2nd, or 3rd."
    )


def plan(school_year, semester, close_open):
    """Return (actions, error). actions is a list of human-readable steps."""
    from app.models.school_term import SchoolTerm

    open_terms = SchoolTerm.query.filter_by(status="open").all()
    if len(open_terms) > 1:
        labels = ", ".join(t.label for t in open_terms)
        return None, (
            f"ERROR: more than one term is open ({labels}). "
            "Close the extras in System Management first — refusing to guess."
        )

    target = SchoolTerm.query.filter_by(
        school_year=school_year, semester=semester).first()
    current_open = open_terms[0] if open_terms else None

    if target is not None and target.status == "open":
        return ["nothing to do"], None

    if current_open is not None and (
            target is None or current_open.id != target.id):
        if not close_open:
            return None, (
                f"ERROR: {current_open.label} is still open — only one term "
                "may be open at a time. Re-run with --close-open, or end it "
                "in System Management first."
            )

    actions = []
    if current_open is not None and (
            target is None or current_open.id != target.id):
        actions.append(f"close {current_open.label} (becomes historical)")
    if target is None:
        actions.append(f"create {school_year} {semester} as draft")
    else:
        actions.append(f"keep existing {target.label} ({target.status})")
    actions.append(f"open {school_year} {semester} (new submissions go here)")
    return actions, None


def apply_plan(school_year, semester):
    """Execute a validated plan. Returns the opened term."""
    from app.extensions import db
    from app.models.school_term import SchoolTerm
    from app.services.activity_service import log_activity

    current_open = SchoolTerm.query.filter_by(status="open").first()
    target = SchoolTerm.query.filter_by(
        school_year=school_year, semester=semester).first()

    if current_open is not None and (
            target is None or current_open.id != target.id):
        current_open.status = "closed"
        log_activity(
            f"Closed school term {current_open.label} (now historical)",
            user_id=None,
        )
        print(f"Closed {current_open.label}.")

    if target is None:
        target = SchoolTerm(
            school_year=school_year, semester=semester, status="draft")
        db.session.add(target)
        db.session.flush()
        log_activity(f"Created school term {target.label}", user_id=None)
        print(f"Created {target.label} as draft.")

    target.status = "open"
    log_activity(f"Opened school term {target.label}", user_id=None)
    db.session.commit()
    print(f"Opened {target.label}.")
    return target


def main(argv=None):
    args = parse_args(argv)
    school_year, semester = validate_inputs(args.school_year, args.semester)

    from app import create_app
    app = create_app()
    with app.app_context():
        actions, error = plan(school_year, semester, args.close_open)
        if error:
            print(error)
            return 1

        if actions == ["nothing to do"]:
            print(f"{school_year} {semester} is already open — nothing to do.")
            return 0

        print(f"Plan for {school_year} {semester}:")
        for step in actions:
            print(f"  - {step}")

        if not args.confirm:
            print("DRY-RUN: nothing was written. Re-run with --confirm to apply.")
            return 0

        apply_plan(school_year, semester)
        print("Done. New submissions now attach to "
              f"{school_year} {semester}. Old reports stay readable.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
