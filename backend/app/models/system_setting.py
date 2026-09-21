from datetime import datetime

from ..extensions import db


class SystemSetting(db.Model):
    __tablename__ = "system_settings"

    id = db.Column(db.Integer, primary_key=True)

    academic_year = db.Column(
        db.String(20),
        nullable=False,
        default="2025-2026"
    )

    semester = db.Column(
        db.Enum("1st", "2nd", "3rd", name="system_semester"),
        nullable=False,
        default="2nd"
    )

    announcement_message = db.Column(
        db.Text,
        nullable=False,
        default=""
    )

    announcement_active = db.Column(
        db.Boolean,
        nullable=False,
        default=False
    )

    updated_at = db.Column(
        db.DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )

    def to_dict(self):
        return {
            "academic_year": self.academic_year,
            "semester": self.semester,
            "announcement_message": self.announcement_message,
            "announcement_active": self.announcement_active,
        }