"""End-to-end tests for staff TOTP two-factor authentication."""
import pyotp
from freezegun import freeze_time
from werkzeug.security import check_password_hash

from app.extensions import db
from app.models.backup_code import BackupCode
from app.models.user import User
from app.utils.totp import (
    code_fingerprint,
    code_recently_used,
    decrypt_secret,
)
from tests.conftest import TEST_SECRET_KEY, make_user


def _login(client, username, password):
    return client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )


def _enable_2fa(client, username):
    """Full enrollment via the API. Returns (secret, backup_codes)."""
    setup = client.post("/api/2fa/setup")
    assert setup.status_code == 200, setup.get_json()
    user = User.query.filter_by(username=username).first()
    assert user is not None
    secret = decrypt_secret(user.totp_secret, TEST_SECRET_KEY)
    assert secret
    code = pyotp.TOTP(secret).now()
    verify = client.post("/api/2fa/verify-setup", json={"code": code})
    assert verify.status_code == 200, verify.get_json()
    # Admins completing forced setup auto-login instead of getting codes.
    return secret, verify.get_json().get("backup_codes")


def test_login_without_2fa_still_returns_200(client, hr_user):
    resp = _login(client, "hr-anne", "Secret123!")
    assert resp.status_code == 200
    assert resp.get_json()["role"] == "hr"
    assert client.get("/api/auth/me").status_code == 200


def test_enable_flow_issues_secret_qr_and_backup_codes(client, hr_user):
    _login(client, "hr-anne", "Secret123!")
    setup = client.post("/api/2fa/setup")
    assert setup.status_code == 200
    body = setup.get_json()
    assert body["qr_svg"].lstrip().startswith("<svg")
    assert body["otpauth_url"].startswith("otpauth://totp/")
    assert body["manual_key"]

    user = User.query.first()
    assert user.two_factor_enabled is False  # stays OFF until verified
    secret = decrypt_secret(user.totp_secret, TEST_SECRET_KEY)
    assert secret == body["manual_key"]

    verify = client.post(
        "/api/2fa/verify-setup", json={"code": pyotp.TOTP(secret).now()}
    )
    assert verify.status_code == 200
    codes = verify.get_json()["backup_codes"]
    assert len(codes) == 8
    assert User.query.first().two_factor_enabled is True
    stored = BackupCode.query.all()
    assert len(stored) == 8
    assert all(not row.used for row in stored)
    # Hashes stored, never plaintext — yet every code matches some hash.
    hashes = [row.code_hash for row in stored]
    for code in codes:
        assert all(stored_hash != code for stored_hash in hashes)
        assert any(
            check_password_hash(stored_hash, code) for stored_hash in hashes
        )


def test_login_challenge_and_code_verification(client, hr_user):
    _login(client, "hr-anne", "Secret123!")
    with freeze_time("2026-01-01 00:00:00"):
        secret, _codes = _enable_2fa(client, "hr-anne")
    client.post("/api/auth/logout")

    with freeze_time("2026-01-01 00:02:00"):
        challenge = _login(client, "hr-anne", "Secret123!")
        assert challenge.status_code == 202
        assert challenge.get_json() == {"two_factor_required": True}
        # Pending state grants nothing.
        assert client.get("/api/auth/me").status_code == 401

        bad = client.post("/api/2fa/verify-login", json={"code": "000000"})
        assert bad.status_code == 401

        good = client.post(
            "/api/2fa/verify-login", json={"code": pyotp.TOTP(secret).now()}
        )
        assert good.status_code == 200
        assert good.get_json()["role"] == "hr"
        assert client.get("/api/auth/me").status_code == 200


def test_consumed_code_cannot_be_replayed(client, hr_user):
    _login(client, "hr-anne", "Secret123!")
    with freeze_time("2026-01-01 00:00:00"):
        secret, _codes = _enable_2fa(client, "hr-anne")
    client.post("/api/auth/logout")

    with freeze_time("2026-01-01 00:02:00"):
        _login(client, "hr-anne", "Secret123!")
        code = pyotp.TOTP(secret).now()
        assert client.post("/api/2fa/verify-login", json={"code": code}).status_code == 200
    client.post("/api/auth/logout")

    with freeze_time("2026-01-01 00:02:20"):
        # Same window: rejected by the consumed-counter check.
        _login(client, "hr-anne", "Secret123!")
        replay = client.post("/api/2fa/verify-login", json={"code": code})
        assert replay.status_code == 401
    client.post("/api/auth/logout")

    with freeze_time("2026-01-01 00:02:40"):
        # Adjacent window (valid_window would still accept it): rejected
        # by the consumed-code fingerprint instead.
        _login(client, "hr-anne", "Secret123!")
        late_replay = client.post("/api/2fa/verify-login", json={"code": code})
        assert late_replay.status_code == 401


def test_lockout_after_five_failures(client, hr_user):
    _login(client, "hr-anne", "Secret123!")
    secret, _codes = _enable_2fa(client, "hr-anne")
    client.post("/api/auth/logout")
    _login(client, "hr-anne", "Secret123!")

    for _ in range(5):
        resp = client.post("/api/2fa/verify-login", json={"code": "000000"})
    assert resp.status_code == 403
    assert User.query.first().totp_locked_until is not None

    # Even the right code is refused while locked.
    locked = client.post(
        "/api/2fa/verify-login", json={"code": pyotp.TOTP(secret).now()}
    )
    assert locked.status_code == 403


def test_backup_code_login_single_use(client, hr_user):
    _login(client, "hr-anne", "Secret123!")
    _secret, codes = _enable_2fa(client, "hr-anne")
    client.post("/api/auth/logout")

    _login(client, "hr-anne", "Secret123!")
    first = client.post("/api/2fa/verify-login", json={"code": codes[0]})
    assert first.status_code == 200
    assert BackupCode.query.filter_by(used=True).count() == 1
    client.post("/api/auth/logout")

    _login(client, "hr-anne", "Secret123!")
    reuse = client.post("/api/2fa/verify-login", json={"code": codes[0]})
    assert reuse.status_code == 401


def test_admin_without_2fa_must_complete_setup(client, admin_user):
    challenge = _login(client, "admin-joe", "Admin123!")
    assert challenge.status_code == 202
    assert challenge.get_json() == {"two_factor_setup_required": True}
    assert client.get("/api/auth/me").status_code == 401

    # Setup endpoints work under the pending session.
    setup = client.post("/api/2fa/setup")
    assert setup.status_code == 200
    secret = decrypt_secret(
        User.query.filter_by(username="admin-joe").first().totp_secret,
        TEST_SECRET_KEY,
    )
    done = client.post(
        "/api/2fa/verify-setup", json={"code": pyotp.TOTP(secret).now()}
    )
    assert done.status_code == 200
    assert done.get_json()["role"] == "admin"
    assert len(done.get_json()["backup_codes"]) == 8
    assert client.get("/api/auth/me").status_code == 200


def test_disable_requires_password_and_restores_direct_login(client, hr_user):
    _login(client, "hr-anne", "Secret123!")
    _enable_2fa(client, "hr-anne")

    wrong = client.post("/api/2fa/disable", json={"password": "nope"})
    assert wrong.status_code == 400

    ok = client.post("/api/2fa/disable", json={"password": "Secret123!"})
    assert ok.status_code == 200
    assert User.query.first().two_factor_enabled is False
    assert BackupCode.query.count() == 0
    client.post("/api/auth/logout")

    assert _login(client, "hr-anne", "Secret123!").status_code == 200


def test_admin_reset_clears_target_but_not_self(client, admin_user):
    with client.application.app_context():
        staff = make_user(
            username="fac-bob", password="Fac12345!", role="faculty", name="Bob Fac"
        )
        staff_id = staff.id
    # Admin completes forced 2FA setup so it can fully log in.
    with freeze_time("2026-01-01 00:00:00"):
        _login(client, "admin-joe", "Admin123!")
        _enable_2fa(client, "admin-joe")
        client.post("/api/auth/logout")

        # Staff enables 2FA first.
        _login(client, "fac-bob", "Fac12345!")
        _enable_2fa(client, "fac-bob")
        client.post("/api/auth/logout")

    with freeze_time("2026-01-01 00:03:00"):
        _login(client, "admin-joe", "Admin123!")
        admin_secret = decrypt_secret(
            User.query.filter_by(username="admin-joe").first().totp_secret,
            TEST_SECRET_KEY,
        )
        assert client.post(
            "/api/2fa/verify-login", json={"code": pyotp.TOTP(admin_secret).now()}
        ).status_code == 200

    reset = client.post(f"/api/2fa/admin/reset/{staff_id}")
    assert reset.status_code == 200
    target = User.query.get(staff_id)
    assert target.two_factor_enabled is False
    assert target.totp_secret is None

    admin_id = User.query.filter_by(username="admin-joe").first().id
    self_reset = client.post(f"/api/2fa/admin/reset/{admin_id}")
    assert self_reset.status_code == 400


def test_penultimate_helpers_replay_window():
    from datetime import datetime, timedelta

    code = "123456"
    fingerprint = code_fingerprint(code)
    now = datetime.utcnow()
    assert code_recently_used(fingerprint, now - timedelta(seconds=10), code, now)
    assert not code_recently_used(fingerprint, now - timedelta(seconds=200), code, now)
    assert not code_recently_used(fingerprint, now - timedelta(seconds=10), "654321", now)
    assert not code_recently_used(None, None, code, now)
