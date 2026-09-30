from datetime import datetime

from ..extensions import db


class Section(db.Model):
    """
    Enrollment Master List: the single source of truth for class sections.

    A section is identified by (grade_level, section_name), e.g. ("11",
    "HUMSS A"). Advisory assignments link to their master section via
    section_id; the denormalized grade/section strings on the advisory
    are kept so eligibility and display logic are untouched.

    Sections are managed by Admin (registrar proxy): manual CRUD plus
    bulk import from the enrollment spreadsheet. Deactivating
    (is_active=False) retires a section without deleting history.
    """
    __tablename__ = "sections"

    id = db.Column(db.Integer, primary_key=True)
    grade_level = db.Column(db.String(20), nullable=False)
    section_name = db.Column(db.String(80), nullable=False)
    school_year = db.Column(db.String(20), nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True, server_default="1")

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("grade_level", "section_name", name="uq_sections_grade_section"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "grade_level": self.grade_level,
            "section_name": self.section_name,
            "school_year": self.school_year,
            "is_active": self.is_active,
        }

    def __repr__(self):
        return f"<Section {self.grade_level} {self.section_name}>"
