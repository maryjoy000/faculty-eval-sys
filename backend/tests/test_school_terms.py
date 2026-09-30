"""School terms lifecycle + per-term weighting/periods (Phase 1).

Run from backend/ (SECRET_KEY + DATABASE_URL must be set):

    python -m pytest tests/test_school_terms.py -q
"""
import os
import sys
import types

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_stub = types.ModuleType("transformers")
_stub.pipeline = lambda *a, **k: (_ for _ in ()).throw(
    RuntimeError("transformers is stubbed in school-terms tests")
)
sys.modules.setdefault("transformers", _stub)

import pytest
from flask import Flask, jsonify
from flask_login import LoginManager

from app.extensions import db
from app.models.activity_log import ActivityLog  # noqa: F401
from app.models.evaluation_period import EvaluationPeriod  # noqa: F401
from app.models.evaluation_type import EvaluationType  # noqa: F401
from app.models.school_term import SchoolTerm  # noqa: F401
from app.models.student import Student  # noqa: F401
from app.models.user import User  # noqa: F401
from app.models.weighting import EvaluationWeighting  # noqa: F401
from app.routes.auth import auth_bp
from app.routes.periods import periods_bp
from app.routes.school_terms import terms_bp
from app.routes.weighting import weighting_bp


def create_terms_app():
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
    flask_app.register_blueprint(terms_bp, url_prefix="/api/school-terms")
    flask_app.register_blueprint(weighting_bp, url_prefix="/api/evaluation-weightings")
    flask_app.register_blueprint(periods_bp, url_prefix="/api/evaluation-periods")
    return flask_app


@pytest.fixture()
def t_app():
    flask_app = create_terms_app()
    # Do NOT hold the app context open across the test: Flask-Login
    # caches current_user on flask.g (app-context scoped), which would
    # leak one client's identity into other clients' requests.
    with flask_app.app_context():
        db.create_all()
    yield flask_app
    with flask_app.app_context():
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def t_client(t_app):
    return t_app.test_client()


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


@pytest.fixture()
def admin_client(t_client):
    client = t_client.application.test_client()
    with t_client.application.app_context():
        _make_user("admin-t", "Admin123!", "admin", "Term Admin")
    _login(client, "admin-t", "Admin123!")
    return client


@pytest.fixture()
def hr_client(t_client):
    client = t_client.application.test_client()
    with t_client.application.app_context():
        _make_user("hr-t", "Hr123456!", "hr", "Term HR")
    _login(client, "hr-t", "Hr123456!")
    return client


def _create_term(client, year="2025-2026", semester="1st"):
    resp = client.post(
        "/api/school-terms",
        json={"school_year": year, "semester": semester},
    )
    assert resp.status_code == 201
    body = resp.get_json()
    assert body["status"] == "draft"
    return body


# --- Terms CRUD + lifecycle ---

def test_create_lists_and_validates(admin_client):
    _create_term(admin_client)
    assert admin_client.post(
        "/api/school-terms",
        json={"school_year": "2025-2026", "semester": "1st"},
    ).status_code == 409
    assert admin_client.post(
        "/api/school-terms",
        json={"school_year": "2025-2026", "semester": "summer"},
    ).status_code == 400
    assert admin_client.post(
        "/api/school-terms", json={"school_year": "", "semester": "1st"}
    ).status_code == 400

    listed = admin_client.get("/api/school-terms").get_json()
    assert len(listed) == 1
    assert listed[0]["status"] == "draft"


def test_open_close_reopen_single_open(admin_client):
    first = _create_term(admin_client, semester="1st")
    second = _create_term(admin_client, semester="2nd")

    assert admin_client.put(
        f"/api/school-terms/{first['id']}/open"
    ).status_code == 200

    # Second open blocked while the first is open.
    blocked = admin_client.put(f"/api/school-terms/{second['id']}/open")
    assert blocked.status_code == 400

    # Reopening an open term is a no-op success.
    assert admin_client.put(
        f"/api/school-terms/{first['id']}/open"
    ).status_code == 200

    # Close is idempotent.
    assert admin_client.put(
        f"/api/school-terms/{first['id']}/close"
    ).status_code == 200
    assert admin_client.put(
        f"/api/school-terms/{first['id']}/close"
    ).status_code == 200

    # Now the second term may open.
    assert admin_client.put(
        f"/api/school-terms/{second['id']}/open"
    ).status_code == 200

    # Reopening the closed first term is blocked by the open second.
    assert admin_client.put(
        f"/api/school-terms/{first['id']}/reopen"
    ).status_code == 400

    assert admin_client.put("/api/school-terms/9999/open").status_code == 404


def test_terms_rbac(hr_client, t_client):
    assert hr_client.get("/api/school-terms").status_code == 200
    assert hr_client.post(
        "/api/school-terms",
        json={"school_year": "2025-2026", "semester": "1st"},
    ).status_code == 403
    assert t_client.get("/api/school-terms").status_code == 401


# --- Per-term weighting ---

def test_weighting_global_and_per_term(admin_client):
    with admin_client.application.app_context():
        db.session.add(EvaluationWeighting())
        db.session.commit()

    default = admin_client.get("/api/evaluation-weightings").get_json()
    assert default["term_id"] is None
    assert default["classroom_observation_pct"] == 70.0

    term = _create_term(admin_client)

    # Falls back to global when the term has no row yet.
    fallback = admin_client.get(
        f"/api/evaluation-weightings?term_id={term['id']}"
    ).get_json()
    assert fallback["term_id"] is None

    updated = admin_client.put(
        "/api/evaluation-weightings",
        json={"term_id": term["id"], "classroom_observation_pct": 60.0},
    )
    assert updated.status_code == 200
    body = updated.get_json()
    assert body["term_id"] == term["id"]
    assert body["classroom_observation_pct"] == 60.0

    scoped = admin_client.get(
        f"/api/evaluation-weightings?term_id={term['id']}"
    ).get_json()
    assert scoped["classroom_observation_pct"] == 60.0

    # Global row untouched.
    assert admin_client.get(
        "/api/evaluation-weightings"
    ).get_json()["classroom_observation_pct"] == 70.0

    assert admin_client.put(
        "/api/evaluation-weightings", json={"term_id": 9999}
    ).status_code == 404


def test_weighting_sums_still_validated(admin_client):
    with admin_client.application.app_context():
        db.session.add(EvaluationWeighting())
        db.session.commit()

    bad = admin_client.put(
        "/api/evaluation-weightings",
        json={"domain6_share_pct": 10.0, "domain7_share_pct": 10.0},
    )
    assert bad.status_code == 400


# --- Periods linked to terms ---

def test_period_term_link_and_closed_block(admin_client):
    with admin_client.application.app_context():
        db.session.add(EvaluationType(code="student", label="Student"))
        db.session.commit()

    term = _create_term(admin_client)
    admin_client.put(f"/api/school-terms/{term['id']}/open")

    linked = admin_client.put(
        "/api/evaluation-periods/current",
        json={"applies_to_type": "student",
              "start_date": "2026-01-10", "end_date": "2026-03-10",
              "term_id": term["id"]},
    )
    assert linked.status_code == 201
    assert linked.get_json()["term_id"] == term["id"]

    admin_client.put(f"/api/school-terms/{term['id']}/close")

    blocked = admin_client.put(
        "/api/evaluation-periods/current",
        json={"start_date": "2026-04-01", "end_date": "2026-05-01",
              "term_id": term["id"]},
    )
    assert blocked.status_code == 400

    assert admin_client.put(
        "/api/evaluation-periods/current",
        json={"start_date": "2026-04-01", "end_date": "2026-05-01",
              "term_id": 9999},
    ).status_code == 404

    # Legacy path (no term) still works.
    legacy = admin_client.put(
        "/api/evaluation-periods/current",
        json={"start_date": "2026-04-01", "end_date": "2026-05-01"},
    )
    assert legacy.status_code == 201
    assert legacy.get_json()["term_id"] is None
