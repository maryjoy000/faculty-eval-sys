from datetime import datetime

from ..extensions import db


class Faculty(db.Model):
    """
    Single source of truth for faculty, mirroring faculty-roster.js.
    No `department` column — per Joy's decision, department has no
    bearing on evaluation and was removed from the frontend entirely.
    """
    __tablename__ = "faculty"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    status = db.Column(db.Enum("Active", "Archived", name="faculty_status"), nullable=False, default="Active")

    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), unique=True, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = db.relationship("User", backref=db.backref("faculty_profile", uselist=False))

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "status": self.status,
            "subjects": [{"code": s.subject_code, "name": s.subject_name} for s in self.subjects],
            "sections": [
                {
                    "grade_level": s.grade_level,
                    "name": s.section_name
                }
                for s in self.sections
            ],
        }

    def __repr__(self):
        return f"<Faculty {self.name}>"


class FacultySubject(db.Model):
    """Replaces the embedded subjects[] array on the old faculty-roster.js rows."""
    __tablename__ = "faculty_subjects"

    id = db.Column(db.Integer, primary_key=True)
    faculty_id = db.Column(db.Integer, db.ForeignKey("faculty.id"), nullable=False)
    subject_code = db.Column(db.String(20), nullable=False)
    subject_name = db.Column(db.String(120), nullable=False)

    faculty = db.relationship("Faculty", backref=db.backref("subjects", lazy=True, cascade="all, delete-orphan"))


class FacultySection(db.Model):
    """Replaces the embedded sections[] array on the old faculty-roster.js rows."""
    __tablename__ = "faculty_sections"

    id = db.Column(db.Integer, primary_key=True)
    faculty_id = db.Column(db.Integer, db.ForeignKey("faculty.id"), nullable=False)
    grade_level = db.Column(db.String(20), nullable=False)
    section_name = db.Column(db.String(80), nullable=False)

    faculty = db.relationship("Faculty", backref=db.backref("sections", lazy=True, cascade="all, delete-orphan"))