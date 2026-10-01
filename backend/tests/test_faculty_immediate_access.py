"""Faculty sees own results immediately — no release required.

Run from backend/:
    SECRET_KEY=test-secret-key-for-pytest-only DATABASE_URL=sqlite:// \
      python -m pytest tests/test_faculty_immediate_access.py -q
"""
import os
import sys
import types
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_stub = types.ModuleType("transformers")
_stub.pipeline = lambda *a, **k: (_ for _ in ()).throw(
    RuntimeError("transformers is stubbed in immediate-access tests")
)
sys.modules.setdefault("transformers", _stub)

import pytest
from flask import Flask, jsonify
from flask_login import LoginManager

from app.extensions import db


def _build_app():
    from app.models.activity_log import ActivityLog  # noqa: F401
    from app.models.criteria import EvaluationCriteria, EvaluationQuestion  # noqa: F401
    from app.models.evaluation import Evaluation, EvaluationResponse  # noqa: F401
    from app.models.evaluation_type import EvaluationType  # noqa: F401
    from app.models.faculty import Faculty  # noqa: F401
    from app.models.faculty_report import FacultyReport  # noqa: F401
    from app.models.rating_scale import RatingScale  # noqa: F401
    from app.models.school_term import SchoolTerm  # noqa: F401
    from app.models.user import User  # noqa: F401
    from app.routes.auth import auth_bp
    from app.routes.evaluations import evaluations_bp

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

    flask_app.register_blueprint(auth_bp, url_prefix="/api/auth")
    flask_app.register_blueprint(evaluations_bp, url_prefix="/api/evaluations")
    return flask_app


@pytest.fixture()
def access_app():
    flask_app = _build_app()
    with flask_app.app_context():
        db.create_all()
        yield flask_app
        db.session.remove()
        db.drop_all()


def _seed():
    from app.models.criteria import EvaluationCriteria, EvaluationQuestion
    from app.models.evaluation import Evaluation, EvaluationResponse
    from app.models.evaluation_type import EvaluationType
    from app.models.faculty import Faculty
    from app.models.rating_scale import RatingScale
    from app.models.user import User

    student_type = EvaluationType(code="student", label="Student")
    db.session.add(student_type)
    db.session.flush()
    criteria = EvaluationCriteria(
        evaluation_type_id=student_type.id, part_number=1, title="Part 1")
    db.session.add(criteria)
    db.session.flush()
    questions = []
    for order, code in enumerate(["q1", "q2"]):
        question = EvaluationQuestion(
            criteria_id=criteria.id, question_code=code,
            text=f"Q {code}", display_order=order)
        db.session.add(question)
        questions.append(question)
    db.session.add(RatingScale(
        evaluation_type_id=student_type.id,
        scale_labels=[{"value": v, "label": f"L{v}"} for v in (1, 2, 3, 4, 5)],
        equivalents=[],
    ))
    user = User(username="fac-ana", role="faculty", name="Ana", status="active")
    user.set_password("Faculty123!")
    db.session.add(user)
    db.session.flush()
    faculty = Faculty(name="Cruz, Ana", status="Active", user_id=user.id)
    db.session.add(faculty)
    db.session.flush()
    other = Faculty(name="Other, Bob", status="Active")
    db.session.add(other)
    db.session.flush()
    evaluation = Evaluation(
        evaluation_type_id=student_type.id,
        faculty_id=faculty.id,
        submitted_at=datetime(2026, 9, 1, 9, 0, 0),
        overall_average=4.5,
        overall_rating_pct=90.0,
        comments="Good",
    )
    db.session.add(evaluation)
    db.session.flush()
    for question, rating in zip(questions, [4, 5]):
        db.session.add(EvaluationResponse(
            evaluation_id=evaluation.id,
            question_id=question.id,
            rating_value=rating,
        ))
    db.session.commit()
    return faculty.id, other.id


def test_faculty_sees_own_summary_without_release(access_app):
    with access_app.app_context():
        faculty_id, _ = _seed()
    client = access_app.test_client()
    assert client.post("/api/auth/login",
                       json={"username": "fac-ana", "password": "Faculty123!"}).status_code == 200

    # No FacultyReport row exists — pre-release — yet this must work.
    resp = client.get(f"/api/evaluations/{faculty_id}")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["per_type"]["student"]["count"] == 1
    assert body["per_type"]["student"]["average_rating"] == 4.5

    breakdown = client.get(f"/api/evaluations/{faculty_id}/student-breakdown")
    assert breakdown.status_code == 200


def test_faculty_still_blocked_from_colleague_data(access_app):
    with access_app.app_context():
        _, other_id = _seed()
    client = access_app.test_client()
    assert client.post("/api/auth/login",
                       json={"username": "fac-ana", "password": "Faculty123!"}).status_code == 200

    assert client.get(f"/api/evaluations/{other_id}").status_code == 403
