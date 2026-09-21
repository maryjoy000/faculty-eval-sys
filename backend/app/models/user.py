from datetime import datetime

from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

from ..extensions import db


class User(db.Model, UserMixin):
    """
    Auth identity for Admin/HR/Faculty roles.
    Students authenticate differently (LRN + derived password against the
    advisory roster) and do not get a row here — see Student model.
    """
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.Enum("admin", "hr", "faculty", name="user_role"), nullable=False)
    status = db.Column(db.Enum("active", "inactive", name="user_status"), nullable=False, default="active")

    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(120))
    phone = db.Column(db.String(20))
    two_factor_enabled = db.Column(db.Boolean, default=False)
    # TOTP secret, Fernet-encrypted (see app/utils/totp.py). Never plaintext.
    totp_secret = db.Column(db.Text, nullable=True)
    totp_failed_attempts = db.Column(
        db.Integer, nullable=False, default=0, server_default="0"
    )
    totp_locked_until = db.Column(db.DateTime, nullable=True)
    # Last consumed TOTP time-counter; rejects code replay within a window.
    totp_last_counter = db.Column(db.Integer, nullable=True)
    # Fingerprint + timestamp of the last accepted code; blocks replays
    # that land in an adjacent time-step (valid_window tolerance).
    totp_last_code_hash = db.Column(db.String(64), nullable=True)
    totp_last_code_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def set_password(self, raw_password):
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password):
        return check_password_hash(self.password_hash, raw_password)

    def get_id(self):
        return f"user:{self.id}"

    def to_dict(self):
        linked_faculty = self.faculty_profile
        return {
            "id": self.id,
            "username": self.username,
            "name": self.name,
            "role": self.role,
            "status": self.status,
            "email": self.email,
            "phone": self.phone,
            "linked_faculty_id": linked_faculty.id if linked_faculty else None,
        }

    def __repr__(self):
        return f"<User {self.username} ({self.role})>"