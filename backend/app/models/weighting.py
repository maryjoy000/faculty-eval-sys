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

    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            "classroom_observation_pct": self.classroom_observation_pct,
            "domain6_share_pct": self.domain6_share_pct,
            "domain7_share_pct": self.domain7_share_pct,
            "peer_share_of_domain6_pct": self.peer_share_of_domain6_pct,
            "student_share_of_domain6_pct": self.student_share_of_domain6_pct,
        }

    def __repr__(self):
        return f"<EvaluationWeighting id={self.id}>"