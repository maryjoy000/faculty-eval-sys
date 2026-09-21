from datetime import datetime

from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash

from ..extensions import db


class Student(db.Model, UserMixin):
    """
    Students authenticate via LRN + a derived last-name password by
    default -- this is a FIRST-TIME/default credential, not meant to be
    permanent. Once a student sets a real password_hash (via the profile
    page), that takes over completely and the derived default stops
    working for them.
    """
    __tablename__ = "students"

    id = db.Column(db.Integer, primary_key=True)
    lrn = db.Column(db.String(12), unique=True, nullable=False)
    last_name = db.Column(db.String(80), nullable=False)
    first_name = db.Column(db.String(80), nullable=False)
    middle_name = db.Column(db.String(80), nullable=True)

    name = db.Column(db.String(120), nullable=False)

    password_hash = db.Column(db.String(255), nullable=True)
    email = db.Column(db.String(120), nullable=True)
    phone = db.Column(db.String(20), nullable=True)

    advisory_assignment_id = db.Column(
        db.Integer, db.ForeignKey("advisory_assignments.id"), nullable=False
    )

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # cascade="all, delete-orphan": deleting an AdvisoryAssignment also
    # deletes its students -- matches the confirm-dialog's own promise
    # ("this will delete the section and its N student(s)") instead of
    # crashing on the FK constraint.
    advisory_assignment = db.relationship(
        "AdvisoryAssignment",
        backref=db.backref("students", lazy=True)
    )

    def to_dict(self):
        return {
            "id": self.id,
            "lrn": self.lrn,
            "name": self.name,
            "last_name": self.last_name,
            "first_name": self.first_name,
            "middle_name": self.middle_name
        }

    def get_expected_default_password(self):
        return self.last_name.strip().lower()

    def check_password(self, raw_password):
        if self.password_hash:
            return check_password_hash(self.password_hash, raw_password)
        return raw_password.strip().lower() == self.get_expected_default_password()

    def set_password(self, raw_password):
        self.password_hash = generate_password_hash(raw_password)

    def get_id(self):
        return f"student:{self.id}"

    def __repr__(self):
        return f"<Student {self.lrn} {self.name}>"