from ..extensions import db


class EvaluationCriteria(db.Model):
    __tablename__ = "evaluation_criteria"

    id = db.Column(db.Integer, primary_key=True)
    evaluation_type_id = db.Column(db.Integer, db.ForeignKey("evaluation_types.id"), nullable=False)
    part_number = db.Column(db.Integer, nullable=False)
    title = db.Column(db.String(150), nullable=False)

    evaluation_type = db.relationship("EvaluationType", backref=db.backref("criteria_parts", lazy=True, cascade="all, delete-orphan"))

    def to_dict(self):
        active_questions = [q for q in self.questions if q.is_active]
        return {
            "part_number": self.part_number,
            "title": self.title,
            "questions": [q.to_dict() for q in sorted(active_questions, key=lambda q: q.display_order)],
        }

    def __repr__(self):
        return f"<EvaluationCriteria part {self.part_number}: {self.title}>"


class EvaluationQuestion(db.Model):
    __tablename__ = "evaluation_questions"

    id = db.Column(db.Integer, primary_key=True)
    criteria_id = db.Column(
        db.Integer,
        db.ForeignKey("evaluation_criteria.id"),
        nullable=False,
    )
    question_code = db.Column(db.String(20), nullable=False)
    text = db.Column(db.Text, nullable=False)
    display_order = db.Column(db.Integer, nullable=False, default=0)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    criteria = db.relationship(
        "EvaluationCriteria",
        backref=db.backref(
            "questions",
            lazy=True,
            cascade="all, delete-orphan",
        ),
    )

    def to_dict(self):
        return {
            "id": self.question_code,
            "text": self.text,
        }