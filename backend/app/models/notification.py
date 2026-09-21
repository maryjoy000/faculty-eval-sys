from datetime import datetime

from ..extensions import db


class Notification(db.Model):
    __tablename__ = "notifications"

    id = db.Column(db.Integer, primary_key=True)

    # Admin / HR / Faculty
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=True
    )

    # Students
    student_id = db.Column(
        db.Integer,
        db.ForeignKey("students.id"),
        nullable=True
    )

    message = db.Column(db.String(255), nullable=False)

    is_read = db.Column(
        db.Boolean,
        default=False,
        nullable=False
    )

    created_at = db.Column(
        db.DateTime,
        default=datetime.utcnow
    )

    user = db.relationship("User")
    student = db.relationship("Student")

    def to_dict(self):
        return {
            "id": self.id,
            "message": self.message,
            "is_read": self.is_read,
            "created_at": (
                self.created_at.isoformat() + "Z"
                if self.created_at else None
            ),
        }

    def __repr__(self):
        return f"<Notification read={self.is_read}>"