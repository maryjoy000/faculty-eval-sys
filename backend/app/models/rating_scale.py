from ..extensions import db


class RatingScale(db.Model):
    __tablename__ = "rating_scales"

    id = db.Column(db.Integer, primary_key=True)
    evaluation_type_id = db.Column(db.Integer, db.ForeignKey("evaluation_types.id"), nullable=False, unique=True)

    scale_labels = db.Column(db.JSON, nullable=False)
    equivalents = db.Column(db.JSON, nullable=False)

    evaluation_type = db.relationship("EvaluationType", backref=db.backref("rating_scale", uselist=False))

    def to_dict(self):
        return {"scale_labels": self.scale_labels, "equivalents": self.equivalents}

    def __repr__(self):
        return f"<RatingScale for type {self.evaluation_type_id}>"