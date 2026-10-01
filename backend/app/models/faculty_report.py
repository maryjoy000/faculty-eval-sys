from datetime import datetime

from ..extensions import db
from ..utils.time import utc_iso


class FacultyReport(db.Model):
    __tablename__ = "faculty_reports"

    id = db.Column(db.Integer, primary_key=True)
    faculty_id = db.Column(db.Integer, db.ForeignKey("faculty.id"), nullable=False, unique=True)
    status = db.Column(
        db.Enum("draft", "released", name="faculty_report_status"),
        nullable=False,
        default="draft"
    )
    released_at = db.Column(db.DateTime, nullable=True)
    released_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    viewed_at = db.Column(db.DateTime, nullable=True)

    faculty = db.relationship("Faculty", backref=db.backref("report", uselist=False))
    released_by_user = db.relationship("User")

    def to_dict(self):
        return {
            "faculty_id": self.faculty_id,
            "status": self.status,
            "released_at": utc_iso(self.released_at),
            "released_by": self.released_by_user.name if self.released_by_user else None,
            "viewed_at": utc_iso(self.viewed_at),
        }

    def __repr__(self):
        return f"<FacultyReport faculty={self.faculty_id} status={self.status}>"