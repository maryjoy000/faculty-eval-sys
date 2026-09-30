"""Enrollment Master List tests: sections, student master, faculty placement.

Run from backend/ (SECRET_KEY + DATABASE_URL must be set, same as the
rest of the suite):

    python -m pytest tests/test_enrollment.py -q

Uses SQLite + create_all (migrations are MySQL-targeted and exercised
on the VPS via `flask db upgrade`).
"""
import os
import sys
import types

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_stub = types.ModuleType("transformers")
_stub.pipeline = lambda *a, **k: (_ for _ in ()).throw(
    RuntimeError("transformers is stubbed in enrollment tests")
)
sys.modules.setdefault("transformers", _stub)

import pytest
from flask import Flask, jsonify
from flask_login import LoginManager

from app.extensions import db
from app.models.activity_log import ActivityLog  # noqa: F401
from app.models.advisory import AdvisoryAssignment  # noqa: F401
from app.models.evaluation import Evaluation  # noqa: F401
from app.models.evaluation_type import EvaluationType  # noqa: F401
from app.models.faculty import Faculty  # noqa: F401
from app.models.section import Section  # noqa: F401
from app.models.student import Student  # noqa: F401
from app.models.user import User  # noqa: F401
from app.routes.advisory import advisory_bp
from app.routes.auth import auth_bp
from app.routes.enrollment import sections_bp, students_bp

TEST_SECRET_KEY = "test-secret-key-for-pytest-only"


def create_enrollment_app():
    flask_app = Flask(__name__)
    flask_app.config.update(
        SECRET_KEY=TEST_SECRET_KEY,
        SQLALCHEMY_DATABASE_URI="sqlite://",
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        TESTING=True,
    )
    db.init_app(flask_app)

    # Mirror the production break-glass bypass admins so the test admin
    # accounts log in with password only (no TOTP enrollment dance).
    flask_app.config["ADMIN_2FA_BYPASS_USERNAMES"] = {"admin-e", "admin-m", "admin-l"}

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
    flask_app.register_blueprint(sections_bp, url_prefix="/api/sections")
    flask_app.register_blueprint(students_bp, url_prefix="/api/students")
    flask_app.register_blueprint(advisory_bp, url_prefix="/api/advisory")
    return flask_app


@pytest.fixture()
def enr_app():
    flask_app = create_enrollment_app()
    # NOTE: the app context is NOT held open across the test. Flask-Login
    # caches current_user on flask.g (app-context scoped), so yielding
    # inside an open context would leak one client's identity into every
    # other client's requests for the whole test.
    with flask_app.app_context():
        db.create_all()
    yield flask_app
    with flask_app.app_context():
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def enr_client(enr_app):
    return enr_app.test_client()


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
def admin_client(enr_app):
    client = enr_app.test_client()
    with enr_app.app_context():
        _make_user("admin-e", "Admin123!", "admin", "Enroll Admin")
    _login(client, "admin-e", "Admin123!")
    return client


@pytest.fixture()
def hr_client(enr_app):
    client = enr_app.test_client()
    with enr_app.app_context():
        _make_user("hr-e", "Hr123456!", "hr", "Enroll HR")
    _login(client, "hr-e", "Hr123456!")
    return client


def _faculty_login(client, username="faculty-e", password="Fac123456!"):
    with client.application.app_context():
        user = _make_user(username, password, "faculty", "Enroll Faculty")
        faculty = Faculty(name="Enroll Faculty", status="Active", user_id=user.id)
        db.session.add(faculty)
        db.session.commit()
        faculty_id = faculty.id
    _login(client, username, password)
    return client, faculty_id


# --- Sections ---

def test_sections_crud_and_unique(admin_client):
    created = admin_client.post(
        "/api/sections",
        json={"grade_level": "11", "section_name": "HUMSS A"},
    )
    assert created.status_code == 201

    duplicate = admin_client.post(
        "/api/sections",
        json={"grade_level": "11", "section_name": "HUMSS A"},
    )
    assert duplicate.status_code == 409

    listed = admin_client.get("/api/sections?q=humss")
    assert listed.status_code == 200
    assert len(listed.get_json()) == 1

    section_id = created.get_json()["id"]
    renamed = admin_client.put(
        f"/api/sections/{section_id}",
        json={"section_name": "HUMSS B"},
    )
    assert renamed.status_code == 200
    assert renamed.get_json()["section_name"] == "HUMSS B"

    deleted = admin_client.delete(f"/api/sections/{section_id}")
    assert deleted.status_code == 200


def test_sections_delete_blocked_when_advisory_linked(admin_client):
    created = admin_client.post(
        "/api/sections",
        json={"grade_level": "12", "section_name": "STEM A"},
    )
    section_id = created.get_json()["id"]

    # Advisory created from the master section links to it.
    slot = admin_client.post(
        "/api/advisory",
        json={"faculty_id": None, "section_id": section_id},
    )
    # faculty_id is required by the advisory endpoint.
    assert slot.status_code == 400

    with admin_client.application.app_context():
        faculty_user = _make_user("faculty-x", "Fac123456!", "faculty", "FX")
        faculty = Faculty(name="FX", status="Active", user_id=faculty_user.id)
        db.session.add(faculty)
        db.session.commit()
        faculty_id = faculty.id

    slot = admin_client.post(
        "/api/advisory",
        json={"faculty_id": faculty_id, "section_id": section_id},
    )
    assert slot.status_code == 201
    assert slot.get_json()["section_id"] == section_id

    blocked = admin_client.delete(f"/api/sections/{section_id}")
    assert blocked.status_code == 409


def test_sections_bulk_upsert(admin_client):
    resp = admin_client.post(
        "/api/sections/bulk",
        json={"sections": [
            {"grade_level": "11", "section_name": "ABM A"},
            {"grade_level": "11", "section_name": "ABM A", "school_year": "2026-2027"},
            {"grade_level": "", "section_name": "BAD"},
        ]},
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["created"] == 1
    assert body["updated"] == 1
    assert len(body["errors"]) == 1


def test_sections_rbac(hr_client, enr_client):
    assert hr_client.get("/api/sections").status_code == 200
    assert hr_client.post(
        "/api/sections",
        json={"grade_level": "11", "section_name": "NOPE"},
    ).status_code == 403
    assert enr_client.get("/api/sections").status_code == 401


# --- Enrollment import + master list ---

def test_enrollment_bulk_creates_verified_and_placed(admin_client):
    resp = admin_client.post(
        "/api/students/bulk",
        json={"students": [
            {"lrn": "100000000001", "last_name": "Dela Cruz",
             "first_name": "Juan", "grade_level": "11",
             "section_name": "HUMSS A"},
            {"lrn": "100000000002", "last_name": "Santos", "first_name": "Ana"},
            {"lrn": "bad", "last_name": "X", "first_name": "Y"},
            {"lrn": "100000000003", "last_name": "", "first_name": "Z"},
        ]},
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["created"] == 2
    assert body["placed"] == 1
    assert len(body["errors"]) == 2

    listed = admin_client.get("/api/students?verified=true")
    rows = listed.get_json()
    assert len(rows) == 2
    placed = [r for r in rows if r["lrn"] == "100000000001"][0]
    assert placed["grade_level"] == "11"
    assert placed["section_name"] == "HUMSS A"
    assert placed["verification_status"] == "verified"

    unassigned = admin_client.get("/api/students?assigned=false").get_json()
    assert [r["lrn"] for r in unassigned] == ["100000000002"]


def test_enrollment_bulk_updates_existing(admin_client):
    admin_client.post(
        "/api/students/bulk",
        json={"students": [
            {"lrn": "100000000010", "last_name": "Old", "first_name": "Name"},
        ]},
    )
    resp = admin_client.post(
        "/api/students/bulk",
        json={"students": [
            {"lrn": "100000000010", "last_name": "New", "first_name": "Name",
             "grade_level": "12", "section_name": "STEM Z"},
        ]},
    )
    body = resp.get_json()
    assert body["created"] == 0
    assert body["updated"] == 1
    assert body["placed"] == 1

    rows = admin_client.get("/api/students?q=100000000010").get_json()
    assert rows[0]["last_name"] == "New"
    assert rows[0]["section_name"] == "STEM Z"


def test_student_update_move_unplace_and_delete(admin_client):
    admin_client.post(
        "/api/students/bulk",
        json={"students": [
            {"lrn": "100000000020", "last_name": "Reyes", "first_name": "Liza",
             "grade_level": "11", "section_name": "TVL A"},
        ]},
    )
    row = admin_client.get("/api/students?q=100000000020").get_json()[0]
    student_id = row["id"]

    moved = admin_client.put(
        f"/api/students/{student_id}",
        json={"verification_status": "verified"},
    )
    assert moved.status_code == 200

    bad_status = admin_client.put(
        f"/api/students/{student_id}",
        json={"verification_status": "bogus"},
    )
    assert bad_status.status_code == 400

    unplaced = admin_client.put(
        f"/api/students/{student_id}",
        json={"advisory_assignment_id": None},
    )
    assert unplaced.status_code == 200
    assert unplaced.get_json()["advisory_assignment_id"] is None

    deleted = admin_client.delete(f"/api/students/{student_id}")
    assert deleted.status_code == 200
    assert admin_client.get("/api/students?q=100000000020").get_json() == []


def test_student_delete_blocked_with_evaluations(admin_client):
    admin_client.post(
        "/api/students/bulk",
        json={"students": [
            {"lrn": "100000000030", "last_name": "Bautista", "first_name": "Eo"},
        ]},
    )
    with admin_client.application.app_context():
        student = Student.query.filter_by(lrn="100000000030").first()
        etype = EvaluationType(code="student", label="Student Evaluation")
        db.session.add(etype)
        faculty = Faculty(name="Eval Target", status="Active")
        db.session.add(faculty)
        db.session.flush()
        db.session.add(Evaluation(
            evaluation_type_id=etype.id,
            faculty_id=faculty.id,
            evaluator_student_id=student.id,
        ))
        db.session.commit()
        student_id = student.id

    blocked = admin_client.delete(f"/api/students/{student_id}")
    assert blocked.status_code == 409


# --- Faculty placement (master-only) ---

def test_faculty_assign_requires_master(enr_client):
    client, faculty_id = _faculty_login(enr_client)

    with client.application.app_context():
        slot = AdvisoryAssignment(
            faculty_id=faculty_id,
            grade_level="11",
            section_name="GAS A",
        )
        db.session.add(slot)
        db.session.commit()
        slot_id = slot.id

    unknown = client.post(
        f"/api/advisory/{slot_id}/students", json={"lrn": "199999999999"}
    )
    assert unknown.status_code == 404

    bad_format = client.post(
        f"/api/advisory/{slot_id}/students", json={"lrn": "123"}
    )
    assert bad_format.status_code == 400


def test_faculty_lookup_student(enr_client):
    with enr_client.application.app_context():
        _make_user("admin-l", "Admin123!", "admin", "Lookup Admin")

    _login(enr_client, "admin-l", "Admin123!")
    enr_client.post(
        "/api/students/bulk",
        json={"students": [
            {"lrn": "100000000050", "last_name": "Aquino", "first_name": "Ben",
             "grade_level": "11", "section_name": "GAS D"},
            {"lrn": "100000000051", "last_name": "Cortez", "first_name": "Lia"},
        ]},
    )

    client, _faculty_id = _faculty_login(enr_client, "faculty-l", "Fac123456!")

    found = client.get("/api/advisory/lookup-student?lrn=100000000050")
    assert found.status_code == 200
    body = found.get_json()
    assert body["name"] == "Aquino, Ben"
    assert body["assigned_section"] == "11 GAS D"

    unplaced = client.get("/api/advisory/lookup-student?lrn=100000000051")
    assert unplaced.status_code == 200
    assert unplaced.get_json()["assigned_section"] is None

    assert client.get("/api/advisory/lookup-student?lrn=123").status_code == 400
    assert client.get(
        "/api/advisory/lookup-student?lrn=199999999999"
    ).status_code == 404


def test_faculty_assign_and_unassign_keeps_master(enr_client):
    with enr_client.application.app_context():
        _make_user("admin-m", "Admin123!", "admin", "Master Admin")

    _login(enr_client, "admin-m", "Admin123!")
    enr_client.post(
        "/api/students/bulk",
        json={"students": [
            {"lrn": "100000000040", "last_name": "Mendoza", "first_name": "Ivy"},
        ]},
    )

    client, faculty_id = _faculty_login(enr_client, "faculty-m", "Fac123456!")

    with client.application.app_context():
        slot = AdvisoryAssignment(
            faculty_id=faculty_id,
            grade_level="11",
            section_name="GAS B",
        )
        db.session.add(slot)
        db.session.commit()
        slot_id = slot.id

    placed = client.post(
        f"/api/advisory/{slot_id}/students", json={"lrn": "100000000040"}
    )
    assert placed.status_code == 200

    again = client.post(
        f"/api/advisory/{slot_id}/students", json={"lrn": "100000000040"}
    )
    assert again.status_code == 200

    with client.application.app_context():
        other = AdvisoryAssignment(
            faculty_id=faculty_id,
            grade_level="11",
            section_name="GAS C",
        )
        db.session.add(other)
        db.session.commit()
        other_id = other.id

    conflict = client.post(
        f"/api/advisory/{other_id}/students", json={"lrn": "100000000040"}
    )
    assert conflict.status_code == 409

    with client.application.app_context():
        student = Student.query.filter_by(lrn="100000000040").first()
        student_id = student.id

    removed = client.delete(f"/api/advisory/{slot_id}/students/{student_id}")
    assert removed.status_code == 200

    # Unassigned, NOT deleted: still in the master list.
    _login(client, "admin-m", "Admin123!")
    rows = client.get("/api/students?q=100000000040").get_json()
    assert len(rows) == 1
    assert rows[0]["advisory_assignment_id"] is None
