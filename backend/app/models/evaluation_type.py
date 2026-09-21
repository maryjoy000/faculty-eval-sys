from ..extensions import db


class EvaluationType(db.Model):
    """
    Centralized evaluation-type registry, replacing the 4 hardcoded type
    strings scattered across criteria-data.js, weighting-data.js, and every
    evaluation page. Seed rows: student, classroomObservation, peerToPeer,
    hrEvaluation (see seed snippet below).
    """
    __tablename__ = "evaluation_types"

    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(40), unique=True, nullable=False)
    label = db.Column(db.String(80), nullable=False)

    def __repr__(self):
        return f"<EvaluationType {self.code}>"