"""Rating distribution endpoint tests.

Run from backend/ (SECRET_KEY + DATABASE_URL must be set):

    python -m pytest tests/test_analytics_distribution.py -q
"""
import os
import sys
import types

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_stub = types.ModuleType("transformers")
_stub.pipeline = lambda *a, **k: (_ for _ in ()).throw(
    RuntimeError("transformers is stubbed in distribution tests")
)
sys.modules.setdefault("transformers", _stub)

import pytest
from flask import Flask, jsonify
from flask_login import LoginManager

from app.extensions import db
from app.models.evaluation import Evaluation  # noqa: F401
from app.models.evaluation_type import EvaluationType  # noqa: F401
from app.models.faculty import Faculty  # noqa: F401
from app.models.rating_scale import RatingScale  # noqa: F401
from app.models.school_term import SchoolTerm  # noqa: F401
from app.models.user import User  # noqa: F401
from app.routes.analytics import analytics_bp
from app.routes.auth import auth_bp

EQUIVALENTS = [
    {"min": 4.20, "max": 5.00, "label": "Outstanding"},
    {"min": 3.40, "max": 4.19, "label": "Very Satisfactory"},
    {"min": 2.60, "max": 3.39, "label": "Satisfactory"},
    {"min": 1.80, "max": 2.59, "label": "Needs Improvement"},
    {"min": 1.00, "max": 1.79, "label": "Poor"},
]


def create_distribution_app():
    flask_app = Flask(__name__)
    flask_app.config.update(
        SECRET_KEY="test-secret-key-for-pytest-only",
        SQLALCHEMY_DATABASE_URI="sqlite://",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        TESTING=True,
    )
    db.init_app(flask_app)

    # Password-only login for the test admin (mirrors production
    # break-glass bypass accounts).
    flask_app.config["ADMIN_2FA_BYPASS_USERNAMES"] = {"admin-d"}

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
    flask_app.register_blueprint(analytics_bp, url_prefix="/api/analytics")
    return flask_app


@pytest.fixture()
def d_app():
    flask_app = create_distribution_app()
    with flask_app.app_context():
        db.create_all()
    yield flask_app
    with flask_app.app_context():
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def admin_client(d_app):
    client = d_app.test_client()
    with d_app.app_context():
        user = User(username="admin-d", role="admin", name="Dist Admin",
                    status="active")
        user.set_password("Admin123!")
        db.session.add(user)

        etype = EvaluationType(code="student", label="Student Evaluation")
        db.session.add(etype)
        db.session.flush()

        db.session.add(RatingScale(
            evaluation_type_id=etype.id,
            scale_labels=[{"value": v, "label": f"L{v}"} for v in (5, 4, 3, 2, 1)],
            equivalents=EQUIVALENTS,
        ))

        term_a = SchoolTerm(school_year="2025-2026", semester="1st", status="open")
        term_b = SchoolTerm(school_year="2024-2025", semester="1st", status="closed")
        db.session.add_all([term_a, term_b])
        db.session.flush()

        ana = Faculty(name="Ana Layson", status="Active")
        bob = Faculty(name="Bob Cruz", status="Active")
        db.session.add_all([ana, bob])
        db.session.flush()

        # Ana: Outstanding in term A, Poor in term B.
        db.session.add(Evaluation(
            evaluation_type_id=etype.id, faculty_id=ana.id, term_id=term_a.id,
            overall_average=4.5, overall_rating_pct=90.0,
        ))
        db.session.add(Evaluation(
            evaluation_type_id=etype.id, faculty_id=ana.id, term_id=term_b.id,
            overall_average=1.2, overall_rating_pct=24.0,
        ))
        # Bob: Satisfactory in term A, nothing in term B.
        db.session.add(Evaluation(
            evaluation_type_id=etype.id, faculty_id=bob.id, term_id=term_a.id,
            overall_average=3.0, overall_rating_pct=60.0,
        ))
        db.session.commit()
    resp = client.post(
        "/api/auth/login", json={"username": "admin-d", "password": "Admin123!"}
    )
    assert resp.status_code == 200
    return client


def _bands(client, query=""):
    resp = client.get(f"/api/analytics/rating-distribution{query}")
    assert resp.status_code == 200
    return resp.get_json()["bands"]


def test_distribution_counts_and_drill_down(admin_client):
    # Unfiltered: Ana's two evaluations average (4.5 + 1.2) / 2 = 2.85.
    bands = _bands(admin_client, "?evaluation_type=student")
    by_label = {b["label"]: b for b in bands}

    assert by_label["Satisfactory"]["count"] == 2
    assert [f["name"] for f in by_label["Satisfactory"]["faculty"]] == [
        "Ana Layson",
        "Bob Cruz",
    ]
    assert by_label["Satisfactory"]["faculty"][0]["average"] == 2.85
    assert by_label["Outstanding"]["count"] == 0
    assert by_label["Poor"]["count"] == 0
    assert by_label["Needs Improvement"]["count"] == 0
    assert by_label["Needs Improvement"]["faculty"] == []


def test_distribution_respects_term(admin_client):
    with admin_client.application.app_context():
        term_b = SchoolTerm.query.filter_by(school_year="2024-2025").first()
        term_b_id = term_b.id

    bands = _bands(
        admin_client, f"?evaluation_type=student&term_id={term_b_id}"
    )
    by_label = {b["label"]: b for b in bands}

    assert by_label["Poor"]["count"] == 1
    assert by_label["Outstanding"]["count"] == 0
    assert by_label["Satisfactory"]["count"] == 0


def test_distribution_validation(admin_client):
    assert admin_client.get(
        "/api/analytics/rating-distribution"
    ).status_code == 400
    assert admin_client.get(
        "/api/analytics/rating-distribution?evaluation_type=bogus"
    ).status_code == 400
    assert admin_client.get(
        "/api/analytics/rating-distribution?evaluation_type=student&term_id=9999"
    ).status_code == 404
    assert admin_client.get(
        "/api/analytics/rating-distribution?evaluation_type=student&term_id=nope"
    ).status_code == 400


def test_overview_respects_term(admin_client):
    with admin_client.application.app_context():
        term_b = SchoolTerm.query.filter_by(school_year="2024-2025").first()

    unscoped = admin_client.get("/api/analytics/overview").get_json()
    assert unscoped["total_evaluations"] == 3
    assert unscoped["evaluations_by_type"]["student"] == 3

    scoped = admin_client.get(
        f"/api/analytics/overview?term_id={term_b.id}"
    ).get_json()
    assert scoped["total_evaluations"] == 1
    assert scoped["evaluations_by_type"]["student"] == 1


def test_summary_dominant_sentiment(admin_client):
    from app.services.aggregation_service import get_faculty_evaluation_summary

    with admin_client.application.app_context():
        ana = Faculty.query.filter_by(name="Ana Layson").first()
        ana_evals = Evaluation.query.filter_by(faculty_id=ana.id).order_by(
            Evaluation.id
        ).all()
        ana_evals[0].comments = "Great teaching!"
        ana_evals[0].sentiment_label = "positive"
        ana_evals[1].comments = "It was okay."
        ana_evals[1].sentiment_label = "neutral"
        db.session.commit()

        summary = get_faculty_evaluation_summary(ana.id)
        assert summary["dominant_sentiment"] == "Positive"

        bob = Faculty.query.filter_by(name="Bob Cruz").first()
        assert (
            get_faculty_evaluation_summary(bob.id)["dominant_sentiment"]
            is None
        )
