"""Historical import web API tests (admin-only validate + commit).

Run from backend/:
    SECRET_KEY=test-secret-key-for-pytest-only DATABASE_URL=sqlite:// \
      python -m pytest tests/test_historical_import_api.py -q
"""
import os
import sys
import types

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_stub = types.ModuleType("transformers")
_stub.pipeline = lambda *a, **k: (_ for _ in ()).throw(
    RuntimeError("transformers is stubbed in historical-import API tests")
)
sys.modules.setdefault("transformers", _stub)

import pytest
from flask import Flask, jsonify
from flask_login import LoginManager

from app.extensions import db


def _build_api_app():
    from app.models.activity_log import ActivityLog  # noqa: F401
    from app.models.criteria import EvaluationCriteria, EvaluationQuestion  # noqa: F401
    from app.models.evaluation import Evaluation, EvaluationResponse  # noqa: F401
    from app.models.evaluation_type import EvaluationType  # noqa: F401
    from app.models.faculty import Faculty  # noqa: F401
    from app.models.rating_scale import RatingScale  # noqa: F401
    from app.models.school_term import SchoolTerm  # noqa: F401
    from app.models.user import User  # noqa: F401
    from app.routes.auth import auth_bp
    from app.routes.imports import imports_bp

    flask_app = Flask(__name__)
    flask_app.config.update(
        SECRET_KEY="test-secret-key-for-pytest-only",
        SQLALCHEMY_DATABASE_URI="sqlite://",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        TESTING=True,
    )
    flask_app.config["ADMIN_2FA_BYPASS_USERNAMES"] = {"admin-t"}
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
    flask_app.register_blueprint(imports_bp, url_prefix="/api/imports")
    return flask_app


@pytest.fixture()
def api_app():
    # Do NOT hold the app context open across the test: Flask-Login
    # caches current_user on flask.g (app-context scoped), which would
    # leak one client's identity into other clients' requests.
    flask_app = _build_api_app()
    with flask_app.app_context():
        db.create_all()
    yield flask_app
    with flask_app.app_context():
        db.session.remove()
        db.drop_all()


def _seed_api_db():
    from app.models.criteria import EvaluationCriteria, EvaluationQuestion
    from app.models.evaluation_type import EvaluationType
    from app.models.faculty import Faculty
    from app.models.rating_scale import RatingScale
    from app.models.user import User

    # All four types always exist in a real (seeded) database; the engine
    # requires them before importing anything.
    type_codes = [
        ("student", "Student Evaluation"),
        ("peerToPeer", "Peer-to-Peer Evaluation"),
        ("hrEvaluation", "HR Evaluation"),
        ("classroomObservation", "Classroom Observation"),
    ]
    types_by_code = {}
    for code, label in type_codes:
        et = EvaluationType(code=code, label=label)
        db.session.add(et)
        db.session.flush()
        types_by_code[code] = et

    student_type = types_by_code["student"]
    criteria = EvaluationCriteria(
        evaluation_type_id=student_type.id, part_number=1, title="Part 1")
    db.session.add(criteria)
    db.session.flush()
    for order, code in enumerate(["q1", "q2"]):
        db.session.add(EvaluationQuestion(
            criteria_id=criteria.id, question_code=code,
            text=f"Q {code}", display_order=order))
    for et in types_by_code.values():
        db.session.add(RatingScale(
            evaluation_type_id=et.id,
            scale_labels=[{"value": v, "label": f"L{v}"} for v in (1, 2, 3, 4, 5)],
            equivalents=[],
        ))
    db.session.add(Faculty(name="Cruz, Ana", status="Active"))
    admin = User(username="admin-t", role="admin", name="T Admin", status="active")
    admin.set_password("Admin123!")
    db.session.add(admin)
    hr = User(username="hr-t", role="hr", name="T HR", status="active")
    hr.set_password("Hr123456!")
    db.session.add(hr)
    db.session.commit()


def _login(client, username, password):
    resp = client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200
    return resp


def _rows():
    return [{
        "faculty_name": "Cruz, Ana",
        "evaluation_type": "student",
        "school_year": "2025-2026",
        "semester": "1st",
        "q1": 4, "q2": 5,
        "comments": "Mahusay",
        "submitted_at": "2025-10-15",
    }]


def test_validate_dry_run_writes_nothing(api_app):
    from app.models.evaluation import Evaluation
    from app.models.school_term import SchoolTerm

    with api_app.app_context():
        _seed_api_db()
    client = api_app.test_client()
    _login(client, "admin-t", "Admin123!")

    resp = client.post("/api/imports/historical/validate",
                       json={"rows": _rows(), "filename": "test.xlsx"})
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["errors"] == []
    assert body["inserted"] == 1

    with api_app.app_context():
        assert Evaluation.query.count() == 0
        assert SchoolTerm.query.count() == 0


def test_commit_persists_and_attributes_admin(api_app):
    from app.models.activity_log import ActivityLog
    from app.models.evaluation import Evaluation

    with api_app.app_context():
        _seed_api_db()
    client = api_app.test_client()
    _login(client, "admin-t", "Admin123!")

    resp = client.post("/api/imports/historical/commit", json={"rows": _rows()})
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["inserted"] == 1

    with api_app.app_context():
        assert Evaluation.query.count() == 1
        evaluation = Evaluation.query.one()
        assert evaluation.overall_average == 4.5
        assert len(evaluation.responses) == 2
        log = ActivityLog.query.order_by(ActivityLog.id.desc()).first()
        assert log is not None and log.user is not None and log.user.role == "admin"


def test_commit_with_row_errors_returns_207_and_commits_valid(api_app):
    from app.models.evaluation import Evaluation

    with api_app.app_context():
        _seed_api_db()
    client = api_app.test_client()
    _login(client, "admin-t", "Admin123!")

    rows = _rows() + [{
        "faculty_name": "Nobody Here",
        "evaluation_type": "student",
        "school_year": "2025-2026",
        "semester": "1st",
        "q1": 4, "q2": 5,
    }]
    resp = client.post("/api/imports/historical/commit", json={"rows": rows})
    assert resp.status_code == 207
    body = resp.get_json()
    assert body["inserted"] == 1
    assert len(body["errors"]) == 1

    with api_app.app_context():
        assert Evaluation.query.count() == 1


def test_rbac_hr_forbidden_and_anonymous_unauthorized(api_app):
    with api_app.app_context():
        _seed_api_db()
    hr_client = api_app.test_client()
    _login(hr_client, "hr-t", "Hr123456!")
    assert hr_client.post("/api/imports/historical/validate",
                          json={"rows": _rows()}).status_code == 403
    assert hr_client.post("/api/imports/historical/commit",
                          json={"rows": _rows()}).status_code == 403

    anon = api_app.test_client()
    assert anon.post("/api/imports/historical/validate",
                     json={"rows": _rows()}).status_code == 401


def test_target_term_override_ignores_file_columns(api_app):
    from app.models.evaluation import Evaluation
    from app.models.school_term import SchoolTerm

    with api_app.app_context():
        _seed_api_db()
        term = SchoolTerm(school_year="2025-2026", semester="1st", status="draft")
        db.session.add(term)
        db.session.commit()
        term_id = term.id

    client = api_app.test_client()
    _login(client, "admin-t", "Admin123!")

    # school_year/semester left blank — the picked term decides.
    rows = [{
        "faculty_name": "Cruz, Ana",
        "evaluation_type": "student",
        "school_year": "",
        "semester": "",
        "q1": 5, "q2": 5,
        "comments": "Override",
        "submitted_at": "2025-09-01",
    }]
    resp = client.post("/api/imports/historical/commit",
                       json={"rows": rows, "target_term_id": term_id})
    assert resp.status_code == 200
    assert resp.get_json()["inserted"] == 1

    with api_app.app_context():
        evaluation = Evaluation.query.one()
        assert evaluation.term_id == term_id
        assert SchoolTerm.query.count() == 1  # no auto-created terms


def test_target_term_unknown_id_is_404(api_app):
    with api_app.app_context():
        _seed_api_db()
    client = api_app.test_client()
    _login(client, "admin-t", "Admin123!")

    resp = client.post("/api/imports/historical/validate",
                       json={"rows": _rows(), "target_term_id": 9999})
    assert resp.status_code == 404


def test_export_returns_import_compatible_rows(api_app):
    from datetime import datetime
    from app.models.criteria import EvaluationQuestion
    from app.models.evaluation import Evaluation, EvaluationResponse
    from app.models.evaluation_type import EvaluationType
    from app.models.faculty import Faculty
    from app.models.school_term import SchoolTerm

    with api_app.app_context():
        _seed_api_db()
        term = SchoolTerm(school_year="2025-2026", semester="1st", status="closed")
        db.session.add(term)
        db.session.flush()
        faculty = Faculty.query.filter_by(name="Cruz, Ana").one()
        student_type = EvaluationType.query.filter_by(code="student").one()
        questions = EvaluationQuestion.query.order_by(EvaluationQuestion.display_order).all()

        detailed = Evaluation(
            evaluation_type_id=student_type.id,
            faculty_id=faculty.id,
            term_id=term.id,
            submitted_at=datetime(2025, 10, 15, 9, 30, 0),
            overall_average=4.5,
            overall_rating_pct=90.0,
            comments="Mahusay",
        )
        db.session.add(detailed)
        db.session.flush()
        for question, rating in zip(questions, [4, 5]):
            db.session.add(EvaluationResponse(
                evaluation_id=detailed.id,
                question_id=question.id,
                rating_value=rating,
            ))
        summary_only = Evaluation(
            evaluation_type_id=student_type.id,
            faculty_id=faculty.id,
            term_id=term.id,
            submitted_at=datetime(2025, 11, 1, 10, 0, 0),
            overall_average=4.2,
            overall_rating_pct=84.0,
            comments=None,
        )
        db.session.add(summary_only)
        db.session.commit()
        term_id = term.id

    client = api_app.test_client()
    _login(client, "admin-t", "Admin123!")

    resp = client.get(f"/api/imports/historical/export?term_id={term_id}")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["term"]["school_year"] == "2025-2026"
    assert body["count"] == 2

    headers = body["headers"]
    for required in ("faculty_name", "evaluation_type", "school_year", "semester",
                     "q1", "q2", "comments", "submitted_at", "overall_average"):
        assert required in headers

    first, second = body["rows"]
    assert first["faculty_name"] == "Cruz, Ana"
    assert first["evaluation_type"] == "student"
    assert first["school_year"] == "2025-2026"
    assert first["semester"] == "1st"
    assert first["q1"] == 4 and first["q2"] == 5
    assert first["comments"] == "Mahusay"
    assert first["submitted_at"] == "2025-10-15 09:30:00"
    assert first["overall_average"] == ""  # detailed: recomputed on re-import

    assert second["q1"] == "" and second["q2"] == ""
    assert second["overall_average"] == 4.2  # summary: preserved


def test_export_guards(api_app):
    with api_app.app_context():
        _seed_api_db()
    client = api_app.test_client()
    _login(client, "admin-t", "Admin123!")

    assert client.get("/api/imports/historical/export").status_code == 400
    assert client.get("/api/imports/historical/export?term_id=abc").status_code == 400
    assert client.get("/api/imports/historical/export?term_id=9999").status_code == 404


def test_export_rbac(api_app):
    with api_app.app_context():
        _seed_api_db()
    hr_client = api_app.test_client()
    _login(hr_client, "hr-t", "Hr123456!")
    assert hr_client.get("/api/imports/historical/export?term_id=1").status_code == 403
    anon = api_app.test_client()
    assert anon.get("/api/imports/historical/export?term_id=1").status_code == 401


def test_payload_guards(api_app):
    with api_app.app_context():
        _seed_api_db()
    client = api_app.test_client()
    _login(client, "admin-t", "Admin123!")

    assert client.post("/api/imports/historical/validate",
                       json={"rows": []}).status_code == 400
    assert client.post("/api/imports/historical/validate",
                       json={"rows": [{"a": 1}]}).get_json()["errors"] != []
    big = [{"faculty_name": "x"}] * 2001
    resp = client.post("/api/imports/historical/validate", json={"rows": big})
    assert resp.status_code == 400
