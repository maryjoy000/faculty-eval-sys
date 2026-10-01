"""Open-term script tests (no ML deps, SQLite only).

Run from backend/:
    SECRET_KEY=test-secret-key-for-pytest-only DATABASE_URL=sqlite:// \
      python -m pytest tests/test_open_school_term.py -q
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from flask import Flask

from app.extensions import db
import open_school_term as script


def _build_app():
    from app.models.school_term import SchoolTerm  # noqa: F401 (register model)

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
def term_app():
    flask_app = _build_app()
    with flask_app.app_context():
        db.create_all()
        yield flask_app
        db.session.remove()
        db.drop_all()


def test_validate_inputs():
    assert script.validate_inputs("2026-2027", "1st") == ("2026-2027", "1st")
    assert script.validate_inputs(" 2026-2027 ", "1st Semester") == ("2026-2027", "1st")
    with pytest.raises(SystemExit):
        script.validate_inputs("2026-207", "1st")
    with pytest.raises(SystemExit):
        script.validate_inputs("2026/2027", "1st")
    with pytest.raises(SystemExit):
        script.validate_inputs("2026-2028", "1st")
    with pytest.raises(SystemExit):
        script.validate_inputs("2026-2027", "summer")


def test_blocked_without_close_flag(term_app):
    from app.models.school_term import SchoolTerm

    with term_app.app_context():
        db.session.add(SchoolTerm(school_year="2025-2026", semester="2nd", status="open"))
        db.session.commit()

        actions, error = script.plan("2026-2027", "1st", close_open=False)
        assert actions is None
        assert "still open" in error
        # Nothing changed.
        assert SchoolTerm.query.filter_by(status="open").count() == 1


def test_close_create_open_flow(term_app):
    from app.models.school_term import SchoolTerm

    with term_app.app_context():
        db.session.add(SchoolTerm(school_year="2025-2026", semester="2nd", status="open"))
        db.session.commit()

        actions, error = script.plan("2026-2027", "1st", close_open=True)
        assert error is None
        assert actions == [
            "close 2025-2026 2nd term (becomes historical)",
            "create 2026-2027 1st as draft",
            "open 2026-2027 1st (new submissions go here)",
        ]
        # Dry-run so far: still one open term.
        assert SchoolTerm.query.filter_by(status="open").count() == 1

        opened = script.apply_plan("2026-2027", "1st")
        assert opened.status == "open"
        assert SchoolTerm.query.filter_by(
            school_year="2025-2026", semester="2nd").one().status == "closed"
        assert SchoolTerm.query.filter_by(status="open").one().school_year == "2026-2027"

        # Re-running is a no-op.
        actions, error = script.plan("2026-2027", "1st", close_open=True)
        assert (actions, error) == (["nothing to do"], None)


def test_existing_draft_opens_without_duplicate(term_app):
    from app.models.school_term import SchoolTerm

    with term_app.app_context():
        db.session.add(SchoolTerm(school_year="2026-2027", semester="1st", status="draft"))
        db.session.commit()

        actions, error = script.plan("2026-2027", "1st", close_open=False)
        assert error is None
        assert "keep existing" in actions[0]
        script.apply_plan("2026-2027", "1st")
        assert SchoolTerm.query.count() == 1
        assert SchoolTerm.query.one().status == "open"
