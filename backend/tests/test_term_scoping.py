"""Term scoping Phase 2: submission terms, closed-term guard, ?term_id filters.

Run from backend/ (SECRET_KEY + DATABASE_URL must be set):

    python -m pytest tests/test_term_scoping.py -q
"""
import os
import sys
import types
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_stub = types.ModuleType("transformers")
_stub.pipeline = lambda *a, **k: (_ for _ in ()).throw(
    RuntimeError("transformers is stubbed in term-scoping tests")
)
sys.modules.setdefault("transformers", _stub)

import pytest
from flask import Flask, jsonify
from flask_login import LoginManager

from app.extensions import db
from app.models.activity_log import ActivityLog  # noqa: F401
from app.models.advisory import AdvisoryAssignment  # noqa: F401
from app.models.criteria import EvaluationCriteria, EvaluationQuestion  # noqa: F401
from app.models.evaluation import Evaluation  # noqa: F401
from app.models.evaluation_type import EvaluationType  # noqa: F401
from app.models.faculty import Faculty, FacultySubject  # noqa: F401
from app.models.rating_scale import RatingScale  # noqa: F401
from app.models.school_term import SchoolTerm  # noqa: F401
from app.models.section import Section  # noqa: F401
from app.models.student import Student  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.weighting import EvaluationWeighting  # noqa: F401
from app.routes import evaluations as evaluations_module
from app.routes.analytics import analytics_bp
from app.routes.auth import auth_bp
from app.routes.evaluations import evaluations_bp


def create_scoping_app():
    flask_app = Flask(__name__)
    flask_app.config.update(
        SECRET_KEY="test-secret-key-for-pytest-only",
        SQLALCHEMY_DATABASE_URI="sqlite://",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        TESTING=True,
    )
    flask_app.config["ADMIN_2FA_BYPASS_USERNAMES"] = {"admin-s"}
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

    flask_app.register_blueprint(auth_bp, url_prefix="/api/auth")
    flask_app.register_blueprint(evaluations_bp, url_prefix="/api/evaluations")
    flask_app.register_blueprint(analytics_bp, url_prefix="/api/analytics")
    return flask_app


@pytest.fixture()
def s_app(monkeypatch):
    # Sentiment model is stubbed; submissions must not depend on it.
    monkeypatch.setattr(
        evaluations_module, "analyze_sentiment", lambda comments: None
    )
    flask_app = create_scoping_app()
    with flask_app.app_context():
        db.create_all()
        yield flask_app
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def s_client(s_app):
    return s_app.test_client()


def _make_user(username, password, role, name):
    user = User(username=username, role=role, name=name, status="active")
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    return user


def _login(client, username, password):
    resp = client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )
    assert resp.status_code == 200
    return resp


def _seed_hr_instrument():
    etype = EvaluationType(code="hrEvaluation", label="HR Evaluation")
    db.session.add(etype)
    db.session.flush()

    part = EvaluationCriteria(
        evaluation_type_id=etype.id, part_number=1, title="Documents"
    )
    db.session.add(part)
    db.session.flush()

    for order, code in enumerate(["p1", "p2"]):
        db.session.add(EvaluationQuestion(
            criteria_id=part.id,
            question_code=code,
            text=f"Question {code}",
            display_order=order,
        ))

    db.session.add(RatingScale(
        evaluation_type_id=etype.id,
        scale_labels=[
            {"value": 5, "label": "Always"},
            {"value": 4, "label": "Often"},
            {"value": 3, "label": "Sometimes"},
            {"value": 2, "label": "Rarely"},
            {"value": 1, "label": "Never"},
        ],
        equivalents=[
            {"min": 4.2, "max": 5.0, "label": "Outstanding"},
            {"min": 1.0, "max": 4.19, "label": "Other"},
        ],
    ))
    db.session.commit()


@pytest.fixture()
def hr_client(s_client):
    client = s_client.application.test_client()
    with s_client.application.app_context():
        _make_user("hr-s", "Hr123456!", "hr", "Scope HR")
        _seed_hr_instrument()
        for name in ("Scope Faculty One", "Scope Faculty Two"):
            db.session.add(Faculty(name=name, status="Active"))
        db.session.add(SchoolTerm(
            school_year="2025-2026", semester="1st", status="open"
        ))
        db.session.add(SchoolTerm(
            school_year="2025-2026", semester="2nd", status="draft"
        ))
        db.session.commit()
    _login(client, "hr-s", "Hr123456!")
    return client


def _faculty_ids(client):
    with client.application.app_context():
        return [f.id for f in Faculty.query.order_by(Faculty.id).all()]


def _term_ids(client):
    with client.application.app_context():
        terms = SchoolTerm.query.order_by(SchoolTerm.id).all()
        return terms[0].id, terms[1].id


def _submit_hr(client, faculty_id, ratings, comments="Solid work."):
    return client.post("/api/evaluations", json={
        "evaluation_type": "hrEvaluation",
        "faculty_id": faculty_id,
        "responses": [
            {"question_id": code, "rating": rating}
            for code, rating in ratings.items()
        ],
        "comments": comments,
    })


def test_submit_defaults_to_open_term(hr_client):
    fid = _faculty_ids(hr_client)[0]
    open_id, _other = _term_ids(hr_client)

    resp = _submit_hr(hr_client, fid, {"p1": 5, "p2": 4})
    assert resp.status_code == 201
    assert resp.get_json()["term_id"] == open_id


def test_no_open_term_leaves_submission_unscoped(hr_client):    # HR/peer/classroom submissions resolve to the open term; with no
    # open term they stay unscoped (legacy leniency). The closed-term
    # 403 below is exercised through the student period path instead.
    fid = _faculty_ids(hr_client)[1]
    open_id, _draft_id = _term_ids(hr_client)

    with hr_client.application.app_context():
        term = SchoolTerm.query.get(open_id)
        term.status = "closed"
        db.session.commit()

    resp = _submit_hr(hr_client, fid, {"p1": 5, "p2": 4})
    assert resp.status_code == 201
    assert resp.get_json()["term_id"] is None


def test_summary_and_breakdown_filter_by_term(hr_client):
    fid = _faculty_ids(hr_client)[0]
    open_id, draft_id = _term_ids(hr_client)

    assert _submit_hr(hr_client, fid, {"p1": 5, "p2": 5}).status_code == 201

    with hr_client.application.app_context():
        other = SchoolTerm.query.get(draft_id)
        other.status = "open"
        db.session.commit()
        first = Evaluation.query.filter_by(faculty_id=fid).first()
        first.term_id = draft_id
        db.session.commit()

    scoped = hr_client.get(f"/api/evaluations/{fid}?term_id={open_id}").get_json()
    assert scoped["per_type"]["hrEvaluation"]["count"] == 0

    scoped = hr_client.get(f"/api/evaluations/{fid}?term_id={draft_id}").get_json()
    assert scoped["per_type"]["hrEvaluation"]["count"] == 1

    unscoped = hr_client.get(f"/api/evaluations/{fid}").get_json()
    assert unscoped["per_type"]["hrEvaluation"]["count"] == 1

    empty_breakdown = hr_client.get(
        f"/api/evaluations/{fid}/hr-breakdown?term_id={open_id}"
    )
    assert empty_breakdown.status_code == 404

    full_breakdown = hr_client.get(
        f"/api/evaluations/{fid}/hr-breakdown?term_id={draft_id}"
    )
    assert full_breakdown.status_code == 200


def test_dashboards_and_analytics_filter(hr_client):
    fid = _faculty_ids(hr_client)[0]
    open_id, _other = _term_ids(hr_client)

    assert _submit_hr(hr_client, fid, {"p1": 4, "p2": 4}).status_code == 201

    assert hr_client.get("/api/evaluations/count").get_json()["total"] == 1
    assert hr_client.get(
        f"/api/evaluations/count?term_id={open_id}"
    ).get_json()["total"] == 1
    assert hr_client.get("/api/evaluations/count?term_id=9999").status_code == 404
    assert hr_client.get("/api/evaluations/count?term_id=nope").status_code == 400

    overview = hr_client.get("/api/analytics/overview").get_json()
    assert overview["total_evaluations"] == 1
    scoped_overview = hr_client.get(
        f"/api/analytics/overview?term_id={open_id}"
    ).get_json()
    assert scoped_overview["total_evaluations"] == 1

    with hr_client.application.app_context():
        term = SchoolTerm(
            school_year="2024-2025", semester="1st", status="closed"
        )
        db.session.add(term)
        db.session.flush()
        empty_id = term.id
        db.session.commit()

    assert hr_client.get(
        f"/api/evaluations/count?term_id={empty_id}"
    ).get_json()["total"] == 0
    assert hr_client.get(
        f"/api/analytics/overview?term_id={empty_id}"
    ).get_json()["total_evaluations"] == 0


def _seed_student_instrument(lrn="100000000099"):
    etype = EvaluationType(code="student", label="Student Evaluation")
    db.session.add(etype)
    db.session.flush()

    part = EvaluationCriteria(
        evaluation_type_id=etype.id, part_number=1, title="Punctuality"
    )
    db.session.add(part)
    db.session.flush()

    for order, code in enumerate(["q1", "q2"]):
        db.session.add(EvaluationQuestion(
            criteria_id=part.id,
            question_code=code,
            text=f"Question {code}",
            display_order=order,
        ))

    db.session.add(RatingScale(
        evaluation_type_id=etype.id,
        scale_labels=[{"value": v, "label": f"L{v}"} for v in (5, 4, 3, 2, 1)],
        equivalents=[{"min": 1.0, "max": 5.0, "label": "Any"}],
    ))

    from app.models.evaluation_period import EvaluationPeriod
    from app.models.faculty import FacultySection

    adviser = Faculty(name="Term Adviser", status="Active")
    db.session.add(adviser)
    db.session.flush()

    slot = AdvisoryAssignment(
        faculty_id=adviser.id, grade_level="11", section_name="T9"
    )
    db.session.add(slot)
    db.session.flush()

    student = Student(
        lrn=lrn, last_name="Sta", first_name="Ana", middle_name=None,
        name="Sta, Ana", advisory_assignment_id=slot.id,
        verification_status="verified", status="active",
    )
    db.session.add(student)
    db.session.commit()
    return adviser.id


def test_student_submit_closed_period_term_rejected(s_client):
    from app.models.evaluation_period import EvaluationPeriod

    client = s_client.application.test_client()
    with s_client.application.app_context():
        _make_user("admin-x", "Admin123!", "admin", "X Admin")
        faculty_id = _seed_student_instrument()
        closed = SchoolTerm(
            school_year="2023-2024", semester="1st", status="closed"
        )
        db.session.add(closed)
        db.session.flush()
        etype = EvaluationType.query.filter_by(code="student").first()
        db.session.add(EvaluationPeriod(
            start_date=date.today() - timedelta(days=1),
            end_date=date.today() + timedelta(days=30),
            applies_to_type_id=etype.id,
            term_id=closed.id,
        ))
        db.session.commit()

    assert client.post(
        "/api/auth/login",
        json={"username": "100000000099", "password": "sta"},
    ).status_code == 200

    blocked = client.post("/api/evaluations", json={
        "evaluation_type": "student",
        "faculty_id": faculty_id,
        "responses": [
            {"question_id": "q1", "rating": 5},
            {"question_id": "q2", "rating": 4},
        ],
        "comments": "Very good.",
    })
    assert blocked.status_code == 403
    assert "closed" in blocked.get_json()["error"].lower()


def test_student_submit_open_period_term_recorded(s_client):
    from app.models.evaluation_period import EvaluationPeriod

    client = s_client.application.test_client()
    with s_client.application.app_context():
        faculty_id = _seed_student_instrument(lrn="100000000098")
        term = SchoolTerm(
            school_year="2026-2027", semester="1st", status="open"
        )
        db.session.add(term)
        db.session.flush()
        etype = EvaluationType.query.filter_by(code="student").first()
        db.session.add(EvaluationPeriod(
            start_date=date.today() - timedelta(days=1),
            end_date=date.today() + timedelta(days=30),
            applies_to_type_id=etype.id,
            term_id=term.id,
        ))
        db.session.commit()
        term_id = term.id

    assert client.post(
        "/api/auth/login",
        json={"username": "100000000098", "password": "sta"},
    ).status_code == 200

    resp = client.post("/api/evaluations", json={
        "evaluation_type": "student",
        "faculty_id": faculty_id,
        "responses": [
            {"question_id": "q1", "rating": 5},
            {"question_id": "q2", "rating": 4},
        ],
        "comments": "Very good.",
    })
    assert resp.status_code == 201
    assert resp.get_json()["term_id"] == term_id


def test_resolve_submission_term_unit(s_client):
    from types import SimpleNamespace
    from app.utils.terms import resolve_submission_term

    with s_client.application.app_context():
        opened = SchoolTerm(
            school_year="2030-2031", semester="1st", status="open"
        )
        closed = SchoolTerm(
            school_year="2030-2031", semester="2nd", status="closed"
        )
        db.session.add_all([opened, closed])
        db.session.commit()
        opened_id, closed_id = opened.id, closed.id

        term_id, error = resolve_submission_term(
            SimpleNamespace(term_id=opened_id)
        )
        assert (term_id, error) == (opened_id, None)

        term_id, error = resolve_submission_term(
            SimpleNamespace(term_id=closed_id)
        )
        assert term_id is None
        assert error[1] == 403

        term_id, error = resolve_submission_term(None)
        assert (term_id, error) == (opened_id, None)

        opened.status = "closed"
        db.session.commit()
        assert resolve_submission_term(None) == (None, None)
