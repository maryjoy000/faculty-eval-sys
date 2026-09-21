from datetime import datetime

from ..extensions import db


class ActivityLog(db.Model):
    """
    Per-identity audit trail. Exactly one of user_id / student_id is
    populated, depending on who performed the action.
    """
    __tablename__ = "activity_logs"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    student_id = db.Column(db.Integer, db.ForeignKey("students.id"), nullable=True)
    description = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship("User")
    student = db.relationship("Student")

    def to_dict(self):
        return {
            "id": self.id,
            "description": self.description,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<ActivityLog {self.description}>"