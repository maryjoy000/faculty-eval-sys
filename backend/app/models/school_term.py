from datetime import datetime

from ..extensions import db

#: Allowed lifecycle states. Draft = being set up, open = live,
#: closed = historical (read-only except for admin corrections).
TERM_STATUSES = ("draft", "open", "closed")

#: Term labels, matching System Management conventions.
TERM_SEMESTERS = ("1st", "2nd", "3rd")


class SchoolTerm(db.Model):
    """A School Year / Term period with a managed lifecycle.

    Terms are created as drafts, opened when live, and closed when the
    period ends. Closed terms are historical: Phase 2 blocks new
    submissions and criteria/weighting edits against them (admin-only
    corrections stay possible). Terms are never deleted so history is
    never destroyed.
    """
    __tablename__ = "school_terms"

    id = db.Column(db.Integer, primary_key=True)
    school_year = db.Column(db.String(20), nullable=False)
    semester = db.Column(db.String(20), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="draft",
                       server_default="draft")

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow,
                           onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint("school_year", "semester",
                            name="uq_school_terms_year_semester"),
    )

    @property
    def label(self):
        return f"{self.school_year} {self.semester} term"

    def to_dict(self):
        return {
            "id": self.id,
            "school_year": self.school_year,
            "semester": self.semester,
            "status": self.status,
        }

    def __repr__(self):
        return f"<SchoolTerm {self.school_year} {self.semester} ({self.status})>"
