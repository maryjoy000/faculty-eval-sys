"""Pytest setup for the FES backend.

Run from the backend/ directory:

    python -m pytest tests/ -q

The suite builds a minimal Flask app (auth + 2FA blueprints only, SQLite)
so no ML dependencies are needed to exercise the security flows.
"""
import os
import sys
import types

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# The 2FA/auth suite never touches the ML sentiment pipeline, but importing
# the `app` package pulls every blueprint (including evaluations ->
# transformers, a ~2GB dependency). Stub it so these tests stay light.
_transformers_stub = types.ModuleType("transformers")


def _unused_pipeline(*args, **kwargs):
    raise RuntimeError("transformers is stubbed in 2FA tests")


_transformers_stub.pipeline = _unused_pipeline
sys.modules.setdefault("transformers", _transformers_stub)

import pytest
from flask import Flask, jsonify
from flask_login import LoginManager

from app.extensions import db
from app.models.activity_log import ActivityLog  # noqa: F401 (register model)
from app.models.backup_code import BackupCode  # noqa: F401 (register model)
from app.models.student import Student  # noqa: F401 (register model)
from app.models.user import User  # noqa: F401 (register model)
from app.routes.auth import auth_bp
from app.routes.two_factor import two_factor_bp

TEST_SECRET_KEY = "test-secret-key-for-pytest-only"


def create_test_app():
    flask_app = Flask(__name__)
    flask_app.config.update(
        SECRET_KEY=TEST_SECRET_KEY,
        SQLALCHEMY_DATABASE_URI="sqlite://",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        TESTING=True,
    )
    db.init_app(flask_app)

    login_manager = LoginManager()
    login_manager.init_app(flask_app)

    @login_manager.user_loader
    def load_user(composite_id):
        kind, _, raw_id = composite_id.partition(":")
        try:
            numeric_id = int(raw_id)
        except (ValueError, TypeError):
            return None
        if kind == "user":
            return User.query.get(numeric_id)
        if kind == "student":
            return Student.query.get(numeric_id)
        return None

    @login_manager.unauthorized_handler
    def unauthorized():
        return jsonify({"error": "Not authenticated"}), 401

    flask_app.register_blueprint(auth_bp, url_prefix="/api/auth")
    flask_app.register_blueprint(two_factor_bp, url_prefix="/api/2fa")
    return flask_app


@pytest.fixture()
def app():
    flask_app = create_test_app()
    with flask_app.app_context():
        db.create_all()
        yield flask_app
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


def make_user(username="hr-anne", password="Secret123!", role="hr", name="Anne HR"):
    user = User(username=username, role=role, name=name, status="active")
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    return user


@pytest.fixture()
def hr_user(app):
    with app.app_context():
        return make_user()


@pytest.fixture()
def admin_user(app):
    with app.app_context():
        return make_user(
            username="admin-joe", password="Admin123!", role="admin", name="Joe Admin"
        )
