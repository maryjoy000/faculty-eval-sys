from datetime import datetime

from ..extensions import db


class EvaluationPeriod(db.Model):
    __tablename__ = "evaluation_periods"

    id = db.Column(db.Integer, primary_key=True)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    applies_to_type_id = db.Column(db.Integer, db.ForeignKey("evaluation_types.id"), nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    applies_to_type = db.relationship("EvaluationType")

    def to_dict(self):
        return {
            "id": self.id,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "applies_to_type": self.applies_to_type.code if self.applies_to_type else None,
        }

    def __repr__(self):
        return f"<EvaluationPeriod {self.start_date}–{self.end_date}>"