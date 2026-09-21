"""Tests for the 'Log out of all other devices' session-version guard.

Note: the pytest app fixture keeps a single application context alive
across requests, but Flask-Login caches the loaded user on `g` for the
lifetime of an application context. Real deployments get a fresh app
context per request, so these tests drop the cached user before every
request to emulate production behavior.
"""
import pyotp
from flask import g

from app.models.user import User


def _fresh_request():
    """Forget Flask-Login's per-app-context user cache (test-only)."""
    g.pop("_login_user", None)


def _login(client, username="hr-anne", password="Secret123!"):
    _fresh_request()
    return client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )


def _get(client, path):
    _fresh_request()
    return client.get(path)


def _post(client, path, payload=None):
    _fresh_request()
    return client.post(path, json=payload or {})


def test_logout_all_devices_invalidates_other_sessions(app, hr_user):
    device_a = app.test_client()
    device_b = app.test_client()

    assert _login(device_a).status_code == 200
    assert _login(device_b).status_code == 200
    assert _get(device_a, "/api/auth/me").status_code == 200
    assert _get(device_b, "/api/auth/me").status_code == 200

    assert _post(device_a, "/api/auth/logout-all").status_code == 200

    # The device that pressed the button stays signed in...
    assert _get(device_a, "/api/auth/me").status_code == 200
    # ...every other device is signed out.
    assert _get(device_b, "/api/auth/me").status_code == 401


def test_login_after_logout_all_works(app, hr_user):
    device_a = app.test_client()
    device_b = app.test_client()

    assert _login(device_a).status_code == 200
    assert _login(device_b).status_code == 200
    assert _post(device_a, "/api/auth/logout-all").status_code == 200

    # A fresh login gets the new version and stays valid...
    device_c = app.test_client()
    assert _login(device_c).status_code == 200
    assert _get(device_c, "/api/auth/me").status_code == 200

    # ...while the old device remains invalidated.
    assert _get(device_b, "/api/auth/me").status_code == 401


def test_logout_all_bumps_session_version(app, hr_user):
    device = app.test_client()
    assert _login(device).status_code == 200

    before = User.query.filter_by(username="hr-anne").first().session_version

    assert _post(device, "/api/auth/logout-all").status_code == 200

    after = User.query.filter_by(username="hr-anne").first().session_version
    assert after == before + 1


def test_logout_all_requires_authentication(client, hr_user):
    assert client.post("/api/auth/logout-all", json={}).status_code == 401


def test_logout_all_does_not_affect_other_users(app, hr_user):
    from tests.conftest import make_user

    with app.app_context():
        make_user(username="hr-cara", password="Cara1234!", name="Cara HR")

    device_anne = app.test_client()
    device_cara = app.test_client()

    assert _login(device_anne).status_code == 200
    assert _login(device_cara, "hr-cara", "Cara1234!").status_code == 200

    assert _post(device_anne, "/api/auth/logout-all").status_code == 200

    # Cara's session is untouched.
    assert _get(device_cara, "/api/auth/me").status_code == 200


def test_two_factor_setup_auto_login_keeps_session_valid(app, admin_user):
    """Admin forced-2FA enrollment must stamp the session version, or the
    very next request would be rejected by the version guard."""
    device = app.test_client()

    _fresh_request()
    challenge = device.post(
        "/api/auth/login", json={"username": "admin-joe", "password": "Admin123!"}
    )
    assert challenge.status_code == 202
    assert challenge.get_json() == {"two_factor_setup_required": True}

    _fresh_request()
    setup = device.post("/api/2fa/setup", json={})
    assert setup.status_code == 200
    secret = setup.get_json()["manual_key"]

    _fresh_request()
    done = device.post(
        "/api/2fa/verify-setup", json={"code": pyotp.TOTP(secret).now()}
    )
    assert done.status_code == 200
    assert len(done.get_json()["backup_codes"]) == 8

    # Fresh app context, like a real subsequent request.
    _fresh_request()
    assert device.get("/api/auth/me").status_code == 200
