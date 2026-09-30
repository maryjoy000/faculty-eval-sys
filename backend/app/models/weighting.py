from datetime import datetime

from ..extensions import db


class EvaluationWeighting(db.Model):
    __tablename__ = "evaluation_weightings"

    id = db.Column(db.Integer, primary_key=True)

    classroom_observation_pct = db.Column(db.Float, nullable=False, default=70.0)
    domain6_share_pct = db.Column(db.Float, nullable=False, default=75.0)
    domain7_share_pct = db.Column(db.Float, nullable=False, default=25.0)
    peer_share_of_domain6_pct = db.Column(db.Float, nullable=False, default=50.0)
    student_share_of_domain6_pct = db.Column(db.Float, nullable=False, default=50.0)

    # Per-term override. NULL is the global default used when a term has
    # no dedicated row (and by every caller that predates terms).
    term_id = db.Column(db.Integer, db.ForeignKey("school_terms.id"),
                        nullable=True, unique=True)

    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    term = db.relationship("SchoolTerm",
                           backref=db.backref("weighting", uselist=False))

    @classmethod
    def resolve_for_term(cls, term_id):
        """Weighting row for a term, falling back to the global default.

        Returns None only when no weighting exists at all (fresh database
        before seeding) — callers keep their existing 404 behavior.
        """
        if term_id is not None:
            row = cls.query.filter_by(term_id=term_id).first()
            if row is not None:
                return row
        return cls.query.filter_by(term_id=None).first()

    def to_dict(self):
        return {
            "term_id": self.term_id,
            "classroom_observation_pct": self.classroom_observation_pct,
            "domain6_share_pct": self.domain6_share_pct,
            "domain7_share_pct": self.domain7_share_pct,
            "peer_share_of_domain6_pct": self.peer_share_of_domain6_pct,
            "student_share_of_domain6_pct": self.student_share_of_domain6_pct,
        }

    def __repr__(self):
        return f"<EvaluationWeighting id={self.id}>"