from functools import wraps

from flask import jsonify, request
from flask_login import current_user


def roles_required(*allowed_roles):
    """Usage: @roles_required("admin", "hr")"""
    def decorator(view_func):
        @wraps(view_func)
        def wrapped(*args, **kwargs):

            if request.method == "OPTIONS":
                return "", 200

            if not current_user.is_authenticated:
                return jsonify({"error": "Not authenticated"}), 401

            role = get_current_role()
            if role not in allowed_roles:
                return jsonify({"error": "Forbidden"}), 403

            return view_func(*args, **kwargs)

        return wrapped
    return decorator


def get_current_role():
    """Returns 'admin' | 'hr' | 'faculty' | 'student' regardless of table."""
    from ..models.student import Student

    if isinstance(current_user._get_current_object(), Student):
        return "student"

    return current_user.role