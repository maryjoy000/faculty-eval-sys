from datetime import datetime

from ..extensions import db


class AdvisoryAssignment(db.Model):
    """
    One faculty adviser's section. Replaces advisory-data.js's global,
    unscoped advisoryClasses list — this FK is the fix for that gap
    (each adviser only ever sees/edits their own assignment's students).
    """
    __tablename__ = "advisory_assignments"

    id = db.Column(db.Integer, primary_key=True)
    faculty_id = db.Column(db.Integer, db.ForeignKey("faculty.id"), nullable=True)
    grade_level = db.Column(db.String(20), nullable=False)
    section_name = db.Column(db.String(80), nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    faculty = db.relationship("Faculty", backref=db.backref("advisory_assignments", lazy=True))

    def to_dict(self):
        return {
            "id": self.id,
            "grade_level": self.grade_level,
            "section_name": self.section_name,
            "students": [s.to_dict() for s in self.students],
        }

    def __repr__(self):
        return f"<AdvisoryAssignment {self.grade_level} {self.section_name}>"