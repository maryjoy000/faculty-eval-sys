"""Backfill-term script tests (SQLite only, no ML deps).

Run from backend/:
    SECRET_KEY=test-secret-key-for-pytest-only DATABASE_URL=sqlite:// \
      python -m pytest tests/test_backfill_term.py -q
"""
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from flask import Flask

from app.extensions import db
import backfill_term as script


def _build_app():
    from app.models.evaluation import Evaluation, EvaluationResponse  # noqa: F401
    from app.models.evaluation_type import EvaluationType  # noqa: F401
    from app.models.faculty import Faculty  # noqa: F401
    from app.models.school_term import SchoolTerm  # noqa: F401

    flask_app = Flask(__name__)
    flask_app.config.update(
        SECRET_KEY="test-secret-key-for-pytest-only",
        SQLALCHEMY_DATABASE_URI="sqlite://",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        TESTING=True,
    )
    db.init_app(flask_app)
    return flask_app


@pytest.fixture()
def backfill_app():
    flask_app = _build_app()
    with flask_app.app_context():
        db.create_all()
        yield flask_app
        db.session.remove()
        db.drop_all()


def _seed():
    from app.models.evaluation import Evaluation
    from app.models.evaluation_type import EvaluationType
    from app.models.faculty import Faculty
    from app.models.school_term import SchoolTerm

    student = EvaluationType(code="student", label="Student")
    peer = EvaluationType(code="peerToPeer", label="Peer")
    db.session.add_all([student, peer])
    db.session.flush()
    faculty = Faculty(name="Cruz, Ana", status="Active")
    db.session.add(faculty)
    db.session.flush()
    term = SchoolTerm(school_year="2026-2027", semester="1st", status="open")
    db.session.add(term)
    db.session.flush()
    old_term = SchoolTerm(school_year="2025-2026", semester="2nd", status="closed")
    db.session.add(old_term)
    db.session.flush()
    # Two unscoped rows (the "All history only" data).
    db.session.add(Evaluation(
        evaluation_type_id=student.id, faculty_id=faculty.id, term_id=None,
        submitted_at=datetime(2026, 8, 1, 9, 0, 0), overall_average=4.0,
        overall_rating_pct=80.0))
    db.session.add(Evaluation(
        evaluation_type_id=peer.id, faculty_id=faculty.id, term_id=None,
        submitted_at=datetime(2026, 9, 15, 10, 0, 0), overall_average=4.5,
        overall_rating_pct=90.0))
    # One already-tagged row: must never move.
    db.session.add(Evaluation(
        evaluation_type_id=student.id, faculty_id=faculty.id, term_id=old_term.id,
        submitted_at=datetime(2026, 3, 1, 9, 0, 0), overall_average=3.0,
        overall_rating_pct=60.0))
    db.session.commit()
    return term.id


def test_validate_inputs():
    assert script.validate_inputs("2026-2027", "1st", None, None) == (
        "2026-2027", "1st", None, None)
    with pytest.raises(SystemExit):
        script.validate_inputs("2026-207", "1st", None, None)
    with pytest.raises(SystemExit):
        script.validate_inputs("2026-2027", "summer", None, None)
    with pytest.raises(SystemExit):
        script.validate_inputs("2026-2027", "1st", "2026-13-01", None)
    with pytest.raises(SystemExit):
        script.validate_inputs("2026-2027", "1st", "2026-10-01", "2026-09-01")


def test_find_candidates_only_unscoped(backfill_app):
    with backfill_app.app_context():
        _seed()
        assert len(script.find_candidates(None, None)) == 2
        after = datetime(2026, 9, 1)
        scoped = script.find_candidates(after, None)
        assert len(scoped) == 1
        assert scoped[0].overall_average == 4.5


def test_move_then_recount(backfill_app):
    from app.models.evaluation import Evaluation

    with backfill_app.app_context():
        term_id = _seed()
        candidates = script.find_candidates(None, None)
        for evaluation in candidates:
            evaluation.term_id = term_id
        db.session.commit()

        assert Evaluation.query.filter(Evaluation.term_id.is_(None)).count() == 0
        assert Evaluation.query.filter_by(term_id=term_id).count() == 2
        # Tagged row untouched.
        assert Evaluation.query.filter(
            Evaluation.term_id.isnot(None),
            Evaluation.term_id != term_id,
        ).count() == 1
