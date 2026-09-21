from datetime import datetime

from ..extensions import db


class Evaluation(db.Model):
    __tablename__ = "evaluations"

    id = db.Column(db.Integer, primary_key=True)
    evaluation_type_id = db.Column(db.Integer, db.ForeignKey("evaluation_types.id"), nullable=False)
    faculty_id = db.Column(db.Integer, db.ForeignKey("faculty.id"), nullable=False)

    evaluator_student_id = db.Column(db.Integer, db.ForeignKey("students.id"), nullable=True)
    evaluator_faculty_id = db.Column(db.Integer, db.ForeignKey("faculty.id"), nullable=True)
    evaluator_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    evaluation_period_id = db.Column(db.Integer, db.ForeignKey("evaluation_periods.id"), nullable=True)

    submitted_at = db.Column(db.DateTime, default=datetime.utcnow)
    overall_average = db.Column(db.Float, nullable=True)
    overall_rating_pct = db.Column(db.Float, nullable=True)
    comments = db.Column(db.Text, nullable=True)
    sentiment_label = db.Column(db.String(20), nullable=True)
    sentiment_score = db.Column(db.Float, nullable=True)

    evaluation_type = db.relationship("EvaluationType")
    faculty = db.relationship("Faculty", foreign_keys=[faculty_id], backref=db.backref("evaluations_received", lazy=True))
    evaluator_student = db.relationship("Student", foreign_keys=[evaluator_student_id])
    evaluator_faculty = db.relationship("Faculty", foreign_keys=[evaluator_faculty_id])
    evaluator_user = db.relationship("User", foreign_keys=[evaluator_user_id])
    evaluation_period = db.relationship("EvaluationPeriod")

    def to_dict(self):
        return {
            "id": self.id,
            "evaluation_type": self.evaluation_type.code,
            "faculty_id": self.faculty_id,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
            "overall_average": self.overall_average,
            "overall_rating_pct": self.overall_rating_pct,
            "comments": self.comments,
            "responses": [r.to_dict() for r in self.responses],
        }

    def __repr__(self):
        return f"<Evaluation type={self.evaluation_type_id} faculty={self.faculty_id}>"


class EvaluationResponse(db.Model):
    __tablename__ = "evaluation_responses"

    id = db.Column(db.Integer, primary_key=True)
    evaluation_id = db.Column(db.Integer, db.ForeignKey("evaluations.id"), nullable=False)
    question_id = db.Column(db.Integer, db.ForeignKey("evaluation_questions.id"), nullable=False)
    rating_value = db.Column(db.Integer, nullable=False)

    evaluation = db.relationship("Evaluation", backref=db.backref("responses", lazy=True))
    question = db.relationship("EvaluationQuestion")

    def to_dict(self):
        return {"question_id": self.question.question_code, "rating": self.rating_value}

    def __repr__(self):
        return f"<EvaluationResponse q={self.question_id} v={self.rating_value}>"