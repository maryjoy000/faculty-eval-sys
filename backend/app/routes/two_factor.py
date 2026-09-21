from datetime import datetime, timedelta

from flask import Blueprint, current_app, jsonify, request, session
from flask_login import current_user, login_required, login_user
from werkzeug.security import check_password_hash, generate_password_hash

from ..extensions import db
from ..models.backup_code import BackupCode
from ..models.user import User
from ..utils.decorators import get_current_role, roles_required
from ..utils.session_guard import start_session_version
from ..utils.totp import (
    BACKUP_CODE_COUNT,
    code_fingerprint,
    code_recently_used,
    decrypt_secret,
    encrypt_secret,
    generate_backup_codes,
    generate_secret,
    provisioning_uri,
    qr_svg,
    verify_code,
)
from ..services.activity_service import log_activity

two_factor_bp = Blueprint("two_factor", __name__)

PENDING_SESSION_KEY = "pending_2fa"
MAX_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


def _app_secret_key():
    return current_app.config["SECRET_KEY"]


def _pending_user():
    """Staff user that passed password but hasn't completed 2FA yet.

    Returns None unless a valid pending challenge exists (never grants
    authentication by itself — callers must still verify a code).
    """
    composite = session.get(PENDING_SESSION_KEY)
    if not composite:
        return None
    kind, _, raw_id = composite.partition(":")
    if kind != "user":
        return None
    try:
        user = User.query.get(int(raw_id))
    except (ValueError, TypeError):
        return None
    if not user or user.status != "active":
        session.pop(PENDING_SESSION_KEY, None)
        return None
    return user


def _acting_staff_user():
    """Fully logged-in staff user, or staff user in a pending-2FA state
    (admins completing forced setup at login). Students are excluded."""
    if current_user.is_authenticated and get_current_role() != "student":
        return current_user._get_current_object()
    return _pending_user()


def _login_payload(user):
    return {
        "id": user.id,
        "username": user.username,
        "name": user.name,
        "role": user.role,
    }


def _complete_login(user):
    login_user(user)
    start_session_version(user)
    session.pop(PENDING_SESSION_KEY, None)
    return jsonify(_login_payload(user)), 200


def _is_locked(user):
    return bool(user.totp_locked_until and user.totp_locked_until > datetime.utcnow())


def _issue_backup_codes(user):
    """Replace all backup codes; returns the plaintext set (shown once)."""
    for old in list(user.backup_codes):
        db.session.delete(old)
    codes = generate_backup_codes(BACKUP_CODE_COUNT)
    for code in codes:
        db.session.add(BackupCode(
            user_id=user.id, code_hash=generate_password_hash(code)
        ))
    return codes


def _stamp_consumed_code(user, raw_code):
    user.totp_last_code_hash = code_fingerprint(raw_code)
    user.totp_last_code_at = datetime.utcnow()


def _record_failure(user):
    user.totp_failed_attempts = (user.totp_failed_attempts or 0) + 1
    if user.totp_failed_attempts >= MAX_ATTEMPTS:
        user.totp_locked_until = datetime.utcnow() + timedelta(minutes=LOCKOUT_MINUTES)
        log_activity("Two-factor authentication locked out", user_id=user.id)
        db.session.commit()
        return True
    db.session.commit()
    return False


@two_factor_bp.route("/setup", methods=["POST"])
def setup():
    """Generate a fresh TOTP secret + QR for enrollment. Flag stays OFF
    until /verify-setup succeeds. Regenerating replaces any previous
    (unverified) secret."""
    user = _acting_staff_user()
    if user is None:
        return jsonify({"error": "Not authenticated"}), 401
    if user.two_factor_enabled:
        return jsonify({"error": "Two-factor is already enabled. Disable it first to re-enroll."}), 400

    secret = generate_secret()
    user.totp_secret = encrypt_secret(secret, _app_secret_key())
    user.totp_failed_attempts = 0
    user.totp_locked_until = None
    user.totp_last_counter = None
    db.session.commit()

    uri = provisioning_uri(secret, user.username)
    return jsonify({
        "otpauth_url": uri,
        "qr_svg": qr_svg(uri),
        "manual_key": secret,
    }), 200


@two_factor_bp.route("/verify-setup", methods=["POST"])
def verify_setup():
    """Confirm enrollment with a code from the authenticator app. On
    success the flag turns ON and one-time backup codes are issued
    (plaintext returned exactly once)."""
    user = _acting_staff_user()
    if user is None:
        return jsonify({"error": "Not authenticated"}), 401
    if not user.totp_secret:
        return jsonify({"error": "No pending enrollment. Call /setup first."}), 400
    if user.two_factor_enabled:
        return jsonify({"error": "Two-factor is already enabled."}), 400

    data = request.get_json(silent=True) or {}
    secret = decrypt_secret(user.totp_secret, _app_secret_key())
    if secret is None:
        return jsonify({"error": "Enrollment is corrupted. Call /setup again."}), 400

    ok, new_counter = verify_code(secret, data.get("code"), user.totp_last_counter)
    if not ok:
        return jsonify({"error": "Invalid code. Check your authenticator app time and try again."}), 401

    codes = _issue_backup_codes(user)
    user.two_factor_enabled = True
    user.totp_failed_attempts = 0
    user.totp_locked_until = None
    user.totp_last_counter = new_counter
    _stamp_consumed_code(user, data.get("code"))
    log_activity("Enabled two-factor authentication", user_id=user.id)
    db.session.commit()

    if session.get(PENDING_SESSION_KEY) == user.get_id():
        # Admin completing forced setup during login: finish the login now.
        log_activity("Signed in with two-factor setup", user_id=user.id)
        db.session.commit()
        login_user(user)
        start_session_version(user)
        session.pop(PENDING_SESSION_KEY, None)
        payload = _login_payload(user)
        payload["backup_codes"] = codes
        return jsonify(payload), 200
    return jsonify({"two_factor_enabled": True, "backup_codes": codes}), 200


@two_factor_bp.route("/verify-login", methods=["POST"])
def verify_login():
    """Second step of login: TOTP code or unused backup code."""
    user = _pending_user()
    if user is None:
        return jsonify({"error": "No pending two-factor challenge."}), 401

    data = request.get_json(silent=True) or {}
    raw_code = str(data.get("code") or "")

    if _is_locked(user):
        retry_in = int((user.totp_locked_until - datetime.utcnow()).total_seconds())
        return jsonify({
            "error": "Too many incorrect attempts. Try again later.",
            "retry_after_seconds": max(retry_in, 0),
        }), 403

    if user.two_factor_enabled and user.totp_secret:
        secret = decrypt_secret(user.totp_secret, _app_secret_key())
        if secret is not None:
            ok, new_counter = verify_code(secret, raw_code, user.totp_last_counter)
            if ok and code_recently_used(
                user.totp_last_code_hash, user.totp_last_code_at, raw_code
            ):
                ok = False  # replay of an already-consumed code
            if ok:
                user.totp_failed_attempts = 0
                user.totp_locked_until = None
                user.totp_last_counter = new_counter
                _stamp_consumed_code(user, raw_code)
                log_activity("Signed in with two-factor code", user_id=user.id)
                db.session.commit()
                return _complete_login(user)

    normalized = raw_code.strip().replace(" ", "")
    for backup in user.backup_codes:
        if not backup.used and check_password_hash(backup.code_hash, normalized):
            backup.used = True
            backup.used_at = datetime.utcnow()
            user.totp_failed_attempts = 0
            user.totp_locked_until = None
            log_activity("Signed in with a backup code", user_id=user.id)
            db.session.commit()
            return _complete_login(user)

    locked = _record_failure(user)
    if locked:
        return jsonify({
            "error": "Too many incorrect attempts. Try again later.",
            "retry_after_seconds": LOCKOUT_MINUTES * 60,
        }), 403
    return jsonify({"error": "Invalid username or password"}), 401


@two_factor_bp.route("/disable", methods=["POST"])
def disable():
    """Turn 2FA off. Requires the current password (same re-confirmation
    rule as changing the password)."""
    if not current_user.is_authenticated or get_current_role() == "student":
        return jsonify({"error": "Not authenticated"}), 401
    user = current_user._get_current_object()

    data = request.get_json(silent=True) or {}
    if not user.check_password(data.get("password") or ""):
        return jsonify({"error": "Current password is incorrect"}), 400

    user.two_factor_enabled = False
    user.totp_secret = None
    user.totp_failed_attempts = 0
    user.totp_locked_until = None
    user.totp_last_counter = None
    user.totp_last_code_hash = None
    user.totp_last_code_at = None
    for old in list(user.backup_codes):
        db.session.delete(old)
    log_activity("Disabled two-factor authentication", user_id=user.id)
    db.session.commit()
    return jsonify({"two_factor_enabled": False}), 200


@two_factor_bp.route("/admin/reset/<int:user_id>", methods=["POST"])
@roles_required("admin")
def admin_reset(user_id):
    """Emergency recovery: clear a staff member's 2FA so they can log in
    with password only and re-enroll. Admins cannot reset themselves here
    (use /disable with password instead)."""
    target = User.query.get(user_id)
    if target is None:
        return jsonify({"error": "User not found"}), 404
    if target.id == current_user.id:
        return jsonify({"error": "Use /disable with your password to change your own settings."}), 400

    target.two_factor_enabled = False
    target.totp_secret = None
    target.totp_failed_attempts = 0
    target.totp_locked_until = None
    target.totp_last_counter = None
    target.totp_last_code_hash = None
    target.totp_last_code_at = None
    for old in list(target.backup_codes):
        db.session.delete(old)
    log_activity(
        f"Reset two-factor authentication for {target.username}",
        user_id=current_user.id,
    )
    db.session.commit()
    return jsonify({"message": f"Two-factor authentication reset for {target.username}"}), 200
