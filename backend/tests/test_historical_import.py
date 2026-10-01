"""Historical importer accuracy tests (no ML deps — sentiment skipped).

Run from backend/:
    python -m pytest tests/test_historical_import.py -q
"""
import csv
import os
import sys
import types

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_stub = types.ModuleType("transformers")
_stub.pipeline = lambda *a, **k: (_ for _ in ()).throw(
    RuntimeError("transformers is stubbed in historical-import tests")
)
sys.modules.setdefault("transformers", _stub)

import pytest
from flask import Flask, jsonify
from flask_login import LoginManager

from app.extensions import db
import import_historical as hist


# --- pure helpers (no database) ---

def test_normalize_helpers():
    assert hist.normalize_name("  Dela   Cruz ") == "dela cruz"
    assert hist.normalize_semester("1st Semester") == "1st"
    assert hist.normalize_semester("2ND") == "2nd"
    assert hist.normalize_semester("summer") is None
    assert hist.validate_school_year("2025-2026") == "2025-2026"
    assert hist.validate_school_year("2025-2027") is None
    assert hist.validate_school_year("2025/2026") is None
    assert hist.normalize_eval_type("student") == "student"
    assert hist.normalize_eval_type("Peer-to-Peer") == "peerToPeer"
    assert hist.normalize_eval_type("HR") == "hrEvaluation"
    assert hist.normalize_eval_type("classroom observation") == "classroomObservation"
    assert hist.normalize_eval_type("bogus") is None


def test_parse_rating_bounds():
    value, err = hist.parse_rating("4", 1, 5, "q1")
    assert (value, err) == (4, None)
    value, err = hist.parse_rating("", 1, 5, "q1")
    assert (value, err) == (None, "missing")
    _, err = hist.parse_rating("6", 1, 5, "q1")
    assert "outside" in err
    _, err = hist.parse_rating("4.5", 1, 5, "q1")
    assert "whole number" in err
    _, err = hist.parse_rating("abc", 1, 5, "q1")
    assert "not a number" in err


def test_parse_submitted_at():
    dt, err = hist.parse_submitted_at("2025-10-15")
    assert err is None and (dt.year, dt.month, dt.day) == (2025, 10, 15)
    dt, err = hist.parse_submitted_at("2025-10-15 09:30:00")
    assert err is None and dt.hour == 9
    dt, err = hist.parse_submitted_at("")
    assert err is None and dt is not None
    _, err = hist.parse_submitted_at("15/10/2025")
    assert "YYYY-MM-DD" in err


def test_read_rows_csv_case_insensitive(tmp_path):
    target = tmp_path / "sample.csv"
    with open(target, "w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["Faculty_Name", "EVALUATION_TYPE", "school_year", "Semester", "Q1", "comments"])
        writer.writerow(["Dela Cruz, Juan", "student", "2025-2026", "1st", "4", "ok"])
        writer.writerow([])  # blank line skipped
    _, rows = hist.read_rows(str(target))
    assert len(rows) == 1
    assert rows[0]["faculty_name"] == "Dela Cruz, Juan"
    assert rows[0]["q1"] == "4"


# --- DB-backed dry-run (SQLite, minimal seed mirroring seed.py codes) ---

def _build_import_app():
    from app.models.activity_log import ActivityLog  # noqa: F401
    from app.models.criteria import EvaluationCriteria, EvaluationQuestion  # noqa: F401
    from app.models.evaluation import Evaluation, EvaluationResponse  # noqa: F401
    from app.models.evaluation_type import EvaluationType  # noqa: F401
    from app.models.faculty import Faculty  # noqa: F401
    from app.models.rating_scale import RatingScale  # noqa: F401
    from app.models.school_term import SchoolTerm  # noqa: F401

    flask_app = Flask(__name__)
    flask_app.config.update(
        SECRET_KEY="test-secret-key-for-pytest-only",
        SQLALCHEMY_DATABASE_URI="sqlite://",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        TESTING=True,
    )
    db.init_app(flask_app)
    login_manager = LoginManager()
    login_manager.init_app(flask_app)

    @login_manager.user_loader
    def load_user(composite_id):
        from app.utils.session_guard import load_user_for_session
        return load_user_for_session(composite_id)

    @login_manager.unauthorized_handler
    def unauthorized():
        return jsonify({"error": "Not authenticated"}), 401

    return flask_app


@pytest.fixture()
def import_app():
    flask_app = _build_import_app()
    with flask_app.app_context():
        db.create_all()
        yield flask_app
        db.session.remove()
        db.drop_all()


def _seed_minimal():
    from app.models.criteria import EvaluationCriteria, EvaluationQuestion
    from app.models.evaluation_type import EvaluationType
    from app.models.faculty import Faculty
    from app.models.rating_scale import RatingScale

    student_type = EvaluationType(code="student", label="Student Evaluation")
    hr_type = EvaluationType(code="hrEvaluation", label="HR Evaluation")
    peer_type = EvaluationType(code="peerToPeer", label="Peer")
    cot_type = EvaluationType(code="classroomObservation", label="COT")
    db.session.add_all([student_type, hr_type, peer_type, cot_type])
    db.session.flush()

    # Student: q1..q3 only (keeps the test fast; logic is identical for q1..q33).
    criteria = EvaluationCriteria(
        evaluation_type_id=student_type.id, part_number=1, title="Part 1")
    db.session.add(criteria)
    db.session.flush()
    for order, code in enumerate(["q1", "q2", "q3"]):
        db.session.add(EvaluationQuestion(
            criteria_id=criteria.id, question_code=code,
            text=f"Question {code}", display_order=order))
    # HR: p1..p2.
    hr_criteria = EvaluationCriteria(
        evaluation_type_id=hr_type.id, part_number=1, title="Docs")
    db.session.add(hr_criteria)
    db.session.flush()
    for order, code in enumerate(["p1", "p2"]):
        db.session.add(EvaluationQuestion(
            criteria_id=hr_criteria.id, question_code=code,
            text=f"HR {code}", display_order=order))
    for et in (student_type, hr_type, peer_type, cot_type):
        db.session.add(RatingScale(
            evaluation_type_id=et.id,
            scale_labels=[{"value": v, "label": f"L{v}"} for v in (1, 2, 3, 4, 5)],
            equivalents=[],
        ))
    db.session.add(Faculty(name="Dela Cruz, Juan", status="Active"))
    db.session.commit()


def _write_csv(path, header, rows):
    with open(path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        writer.writerows(rows)


def test_dry_run_inserts_nothing_but_validates(import_app, tmp_path):
    from app.models.evaluation import Evaluation
    from app.models.school_term import SchoolTerm

    with import_app.app_context():
        _seed_minimal()
        target = str(tmp_path / "history.csv")
        _write_csv(target,
                   ["faculty_name", "evaluation_type", "school_year", "semester",
                    "q1", "q2", "q3", "comments", "submitted_at"],
                   [["Dela Cruz, Juan", "student", "2025-2026", "1st",
                     "4", "5", "4", "Magaling", "2025-10-15"]])
        summary = hist.run_import(target, dry_run=True, no_sentiment=True)
        assert summary["errors"] == []
        assert summary["inserted"] == 1
        # Rolled back: nothing persisted.
        assert Evaluation.query.count() == 0
        assert SchoolTerm.query.count() == 0


def test_row_errors_do_not_block_valid_rows(import_app, tmp_path):
    from app.models.evaluation import Evaluation

    with import_app.app_context():
        _seed_minimal()
        target = str(tmp_path / "history.csv")
        _write_csv(target,
                   ["faculty_name", "evaluation_type", "school_year", "semester",
                    "q1", "q2", "q3", "comments", "submitted_at"],
                   [
                       ["Dela Cruz, Juan", "student", "2025-2026", "1st",
                        "4", "5", "4", "Good", "2025-10-15"],
                       ["Unknown Person", "student", "2025-2026", "1st",
                        "4", "5", "4", "Good", "2025-10-15"],
                       ["Dela Cruz, Juan", "student", "2025-2026", "1st",
                        "4", "5", "", "Good", "2025-10-15"],
                   ])
        summary = hist.run_import(target, dry_run=True, no_sentiment=True)
        assert summary["inserted"] == 1
        assert len(summary["errors"]) == 2
        assert any("not found" in e for e in summary["errors"])
        assert any("incomplete ratings" in e for e in summary["errors"])
        assert Evaluation.query.count() == 0  # dry-run rolls back


def test_summary_mode_and_real_commit(import_app, tmp_path):
    from app.models.evaluation import Evaluation
    from app.models.school_term import SchoolTerm

    with import_app.app_context():
        _seed_minimal()
        target = str(tmp_path / "history.csv")
        _write_csv(target,
                   ["faculty_name", "evaluation_type", "school_year", "semester",
                    "comments", "submitted_at", "overall_average"],
                   [["Dela Cruz, Juan", "student", "2025-2026", "2nd",
                     "Summary only", "2026-03-10", "4.20"]])
        summary = hist.run_import(target, dry_run=False, no_sentiment=True)
        assert summary["errors"] == []
        assert summary["inserted"] == 1
        evaluation = Evaluation.query.one()
        assert evaluation.term_id == SchoolTerm.query.one().id
        assert abs(evaluation.overall_average - 4.20) < 1e-9
        assert evaluation.overall_rating_pct == round(4.20 / 5 * 100, 2)
        assert evaluation.responses == []  # summary mode: no per-question rows
