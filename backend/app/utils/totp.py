"""TOTP two-factor helpers (staff-only 2FA).

Secrets are NEVER stored in plaintext: they are Fernet-encrypted with a key
derived from the app SECRET_KEY before hitting the database.
"""
import base64
import hashlib
import secrets
from datetime import datetime, timezone

import pyotp
import qrcode
import qrcode.image.svg
from cryptography.fernet import Fernet, InvalidToken

ISSUER_NAME = "HeadwatersFES"
BACKUP_CODE_COUNT = 8
# A consumed code is rejected if presented again within this window, even
# across adjacent TOTP time-steps (valid_window otherwise re-accepts it).
CODE_REUSE_WINDOW_SECONDS = 120


def _fernet(secret_key):
    """Fernet needs a 32-byte urlsafe-b64 key; SECRET_KEY is arbitrary
    length, so derive a stable key from it via SHA-256."""
    digest = hashlib.sha256(secret_key.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(plain_secret, secret_key):
    return _fernet(secret_key).encrypt(plain_secret.encode("utf-8")).decode("utf-8")


def decrypt_secret(token, secret_key):
    try:
        return _fernet(secret_key).decrypt(token.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError, AttributeError):
        return None


def generate_secret():
    return pyotp.random_base32()


def provisioning_uri(secret, username):
    return pyotp.totp.TOTP(secret).provisioning_uri(
        name=username, issuer_name=ISSUER_NAME
    )


def qr_svg(otpauth_url):
    img = qrcode.make(otpauth_url, image_factory=qrcode.image.svg.SvgPathImage)
    return img.to_string().decode("utf-8")


def _looks_like_code(raw_code):
    if raw_code is None:
        return False
    code = str(raw_code).strip().replace(" ", "")
    return code.isdigit() and len(code) == 6


def _utcnow():
    # pyotp>=2.10 timecode() requires a datetime (floats crash), and it
    # must be timezone-aware UTC — naive datetimes are read as LOCAL time.
    return datetime.now(timezone.utc)


def current_counter(secret):
    return pyotp.totp.TOTP(secret).timecode(_utcnow())


def verify_code(secret, raw_code, last_counter=None):
    """Verify a 6-digit TOTP code.

    Returns (ok, new_last_counter). Rejects codes from a time window that
    was already consumed (replay protection) and tolerates +-1 step of
    clock skew via valid_window=1.
    """
    if not _looks_like_code(raw_code):
        return False, last_counter
    code = str(raw_code).strip().replace(" ", "")
    totp = pyotp.totp.TOTP(secret)
    if not totp.verify(code, valid_window=1):
        return False, last_counter
    now_counter = totp.timecode(_utcnow())
    if last_counter is not None and now_counter <= last_counter:
        return False, last_counter
    return True, now_counter


def code_fingerprint(raw_code):
    return hashlib.sha256(str(raw_code).strip().encode("utf-8")).hexdigest()


def code_recently_used(last_hash, last_at, raw_code, now=None,
                       max_age_seconds=CODE_REUSE_WINDOW_SECONDS):
    """True if this exact code was already accepted within the reuse
    window (blocks cross-window replays that valid_window would allow)."""
    if not last_hash or not last_at:
        return False
    now = now or datetime.utcnow()
    age_seconds = (now - last_at).total_seconds()
    if age_seconds < 0 or age_seconds >= max_age_seconds:
        return False
    return secrets.compare_digest(last_hash, code_fingerprint(raw_code))


def generate_backup_codes(count=BACKUP_CODE_COUNT):
    """Return `count` human-typable one-time codes (shown to the user once,
    only hashes are stored)."""
    codes = set()
    while len(codes) < count:
        codes.add(secrets.token_hex(5).upper())
    return sorted(codes)
