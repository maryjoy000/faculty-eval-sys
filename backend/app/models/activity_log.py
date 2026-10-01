from datetime import datetime

from ..extensions import db
from ..utils.time import utc_iso


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
        actor_name = None
        actor_role = None

        if self.user is not None:
            actor_name = self.user.name
            actor_role = self.user.role
        elif self.student is not None:
            actor_name = self.student.name
            actor_role = "student"

        return {
            "id": self.id,
            "description": self.description,
            "created_at": utc_iso(self.created_at),
            "actor_name": actor_name,
            "actor_role": actor_role,
        }

    def __repr__(self):
        return f"<ActivityLog {self.description}>"