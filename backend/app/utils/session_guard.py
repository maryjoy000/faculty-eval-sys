"""Shared session-version guard.

Every login stores the identity's current `session_version` in the Flask
session, and the login manager re-checks it on every request. "Log out of
all other devices" bumps that number, which invalidates every session that
still holds the old value while keeping the device that pressed the button
signed in.
"""
from flask import session

from ..models.student import Student
from ..models.user import User

SESSION_VERSION_KEY = "session_version"


def load_user_for_session(composite_id):
    """Flask-Login user_loader with session-version validation.

    Returns None (i.e. logged out) when the session was issued against an
    older session_version — that is how stale devices get kicked out.
    """
    kind, _, raw_id = composite_id.partition(":")
    try:
        numeric_id = int(raw_id)
    except (ValueError, TypeError):
        return None

    if kind == "user":
        identity = User.query.get(numeric_id)
    elif kind == "student":
        identity = Student.query.get(numeric_id)
    else:
        return None

    if identity is None:
        return None

    stored_version = session.get(SESSION_VERSION_KEY)
    current_version = getattr(identity, "session_version", 1) or 1
    if stored_version != current_version:
        return None

    return identity


def start_session_version(identity):
    """Record the identity's session version in the current session."""
    session[SESSION_VERSION_KEY] = getattr(identity, "session_version", 1) or 1
