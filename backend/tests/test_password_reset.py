"""Tests for the email-based password reset flow.

SMTP is never contacted: `app.routes.auth.send_email` is monkeypatched and
the reset token is extracted from the captured email body.
"""
import re

from freezegun import freeze_time

import app.routes.auth as auth_routes
from app.extensions import db
from app.models.user import User
from app.utils.password_reset import make_reset_token


def _set_email(username, email):
    user = User.query.filter_by(username=username).first()
    user.email = email
    db.session.commit()
    return user


def _capture_email(monkeypatch):
    sent = []

    def fake_send_email(to_address, subject, body_text):
        sent.append({"to": to_address, "subject": subject, "body": body_text})

    monkeypatch.setattr(auth_routes, "send_email", fake_send_email)
    return sent


def _request_token(client, sent, email):
    client.post("/api/auth/forgot-password", json={"email": email})
    assert sent, "no email was captured"
    match = re.search(r"token=([A-Za-z0-9_\-\.]+)", sent[-1]["body"])
    assert match, sent[-1]["body"]
    return match.group(1)


def _reset(client, token, password, confirm=None):
    return client.post("/api/auth/reset-password", json={
        "token": token,
        "password": password,
        "confirm_password": password if confirm is None else confirm,
    })


def test_forgot_password_unknown_email_stays_generic(client, monkeypatch):
    sent = _capture_email(monkeypatch)

    r = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})

    assert r.status_code == 200
    assert "reset link" in r.get_json()["message"].lower()
    assert sent == []


def test_forgot_password_missing_email_stays_generic(client, monkeypatch):
    sent = _capture_email(monkeypatch)

    r = client.post("/api/auth/forgot-password", json={})

    assert r.status_code == 200
    assert sent == []


def test_full_reset_flow(app, client, hr_user, monkeypatch):
    sent = _capture_email(monkeypatch)
    _set_email("hr-anne", "Anne@Example.com")  # mixed case on purpose

    version_before = User.query.filter_by(username="hr-anne").first().session_version

    token = _request_token(client, sent, "anne@example.com")

    assert len(sent) == 1
    assert sent[0]["to"] == "Anne@Example.com"
    assert "reset" in sent[0]["subject"].lower()
    assert "/src/reset-password.html?token=" in sent[0]["body"]

    r = _reset(client, token, "BrandNewPass123!")
    assert r.status_code == 200

    version_after = User.query.filter_by(username="hr-anne").first().session_version
    assert version_after == version_before + 1

    # New password works; the old one no longer does.
    assert client.post("/api/auth/login", json={
        "username": "hr-anne", "password": "BrandNewPass123!",
    }).status_code == 200
    client.post("/api/auth/logout", json={})
    assert client.post("/api/auth/login", json={
        "username": "hr-anne", "password": "Secret123!",
    }).status_code == 401


def test_token_is_single_use(app, client, hr_user, monkeypatch):
    sent = _capture_email(monkeypatch)
    _set_email("hr-anne", "anne@example.com")
    token = _request_token(client, sent, "anne@example.com")

    assert _reset(client, token, "FirstChange123!").status_code == 200
    # Same link again -> rejected because the password fingerprint changed.
    assert _reset(client, token, "SecondChange123!").status_code == 400


def test_expired_token_rejected(app, client, hr_user, monkeypatch):
    _capture_email(monkeypatch)
    _set_email("hr-anne", "anne@example.com")

    with freeze_time("2026-01-01 12:00:00"):
        user = User.query.filter_by(username="hr-anne").first()
        token = make_reset_token(app.config["SECRET_KEY"], user)

    with freeze_time("2026-01-01 14:30:00"):  # 2.5 hours later
        r = _reset(client, token, "TooLate12345!")
    assert r.status_code == 400
    assert "invalid or has expired" in r.get_json()["error"].lower()


def test_invalid_token_rejected(client, hr_user):
    assert _reset(client, "not-a-real-token", "Whatever123!").status_code == 400
    assert _reset(client, "", "Whatever123!").status_code == 400


def test_reset_requires_matching_confirmation(client, hr_user, monkeypatch):
    sent = _capture_email(monkeypatch)
    _set_email("hr-anne", "anne@example.com")
    token = _request_token(client, sent, "anne@example.com")

    r = _reset(client, token, "GoodPassword123!", confirm="DifferentPassword123!")
    assert r.status_code == 400
    assert "do not match" in r.get_json()["error"]

    r = _reset(client, token, "GoodPassword123!", confirm="")
    assert r.status_code == 400


def test_reset_requires_minimum_length(client, hr_user, monkeypatch):
    sent = _capture_email(monkeypatch)
    _set_email("hr-anne", "anne@example.com")
    token = _request_token(client, sent, "anne@example.com")

    r = _reset(client, token, "short")
    assert r.status_code == 400
    assert "8 characters" in r.get_json()["error"]
