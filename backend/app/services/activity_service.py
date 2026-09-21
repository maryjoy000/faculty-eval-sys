from ..extensions import db
from ..models.activity_log import ActivityLog


def log_activity(description, user_id=None, student_id=None):
    db.session.add(
        ActivityLog(
            description=description,
            user_id=user_id,
            student_id=student_id
        )
    )