"""Signed, expiring password-reset tokens.

Tokens are stateless (itsdangerous signature + timestamp) and carry a
fingerprint of the identity's CURRENT password state. That makes a link
single-use in practice: once the password is changed, the fingerprint no
longer matches and the same link is rejected.
"""
import hashlib

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from ..models.student import Student
from ..models.user import User

RESET_SALT = "password-reset"
RESET_MAX_AGE_SECONDS = 60 * 60  # links expire after 1 hour


def _serializer(secret_key):
    return URLSafeTimedSerializer(secret_key, salt=RESET_SALT)


def _password_fingerprint(identity):
    source = getattr(identity, "password_hash", None) or "derived-default"
    return hashlib.sha256(source.encode("utf-8")).hexdigest()[:16]


def _load_identity(composite_id):
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


def make_reset_token(secret_key, identity):
    payload = {
        "sub": identity.get_id(),
        "pw": _password_fingerprint(identity),
    }
    return _serializer(secret_key).dumps(payload)


def read_reset_token(secret_key, token, max_age=RESET_MAX_AGE_SECONDS):
    """Returns (composite_id, password_fingerprint) or None."""
    if not token:
        return None
    try:
        payload = _serializer(secret_key).loads(token, max_age=max_age)
    except (BadSignature, SignatureExpired):
        return None
    composite_id = payload.get("sub")
    fingerprint = payload.get("pw")
    if not composite_id or not fingerprint:
        return None
    return composite_id, fingerprint


def identity_from_reset_token(secret_key, token, max_age=RESET_MAX_AGE_SECONDS):
    """The identity a valid, unexpired, unused reset token belongs to.

    Returns None for invalid/expired tokens and for tokens produced before
    a password change (fingerprint mismatch)."""
    parsed = read_reset_token(secret_key, token, max_age=max_age)
    if parsed is None:
        return None

    composite_id, fingerprint = parsed
    identity = _load_identity(composite_id)
    if identity is None:
        return None

    if _password_fingerprint(identity) != fingerprint:
        return None

    return identity
