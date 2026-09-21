"""
One-time seed script: evaluation types, criteria parts + questions,
rating scales, and the default weighting row.
 
Data copied EXACTLY from src/js/data/criteria-data.js's DEFAULT_CRITERIA /
DEFAULT_SCALE, and weighting-data.js's defaults — not invented.
 
Usage (from backend/, with the venv active):
    .\\venv\\Scripts\\python.exe seed.py
 
Safe to re-run: skips seeding if evaluation_types already has rows.
"""
 
from app import create_app
from app.extensions import db
from app.models.evaluation_type import EvaluationType
from app.models.criteria import EvaluationCriteria, EvaluationQuestion
from app.models.rating_scale import RatingScale
from app.models.weighting import EvaluationWeighting
 
EVALUATION_TYPES = [
    ("student", "Student Evaluation"),
    ("classroomObservation", "Classroom Observation"),
    ("peerToPeer", "Peer-to-Peer Evaluation"),
    ("hrEvaluation", "HR Evaluation"),
]
 
DEFAULT_CRITERIA = {
    "student": [
        {
            "partNumber": 1,
            "title": "Part 1: Punctuality and Timeliness <br> The Teacher...",
            "questions": [
                {"id": "q1", "text": "Comes on classes early and dismisses according to the official time of the classes."},
                {"id": "q2", "text": "Announces important school matters ahead of time."},
                {"id": "q3", "text": "Administers classroom activities according to the school schedules"},
                {"id": "q4", "text": "Returns activity, homework, and assignments in a timely manner."},
            ],
        },
        {
            "partNumber": 2,
            "title": "Part 2: Transparency <br> The Teacher...",
            "questions": [
                {"id": "q5", "text": "Explains to the class how they will be graded on every class standing."},
                {"id": "q6", "text": "Updates students who have lacking subject requirements for compliance."},
                {"id": "q7", "text": "Gives grades fairly according to the student's classroom performance."},
                {"id": "q8", "text": "Clearly states what students should be able to do by the end of a lesson or unit."},
                {"id": "q9", "text": "Gives feedback to the students performances and outputs including ways to improve."},
            ],
        },
        {
            "partNumber": 3,
            "title": "Part 3: Mastery <br> The Teacher...",
            "questions": [
                {"id": "q10", "text": "Is well knowledgable with the subject area and understands what he/she is delivering to the class."},
                {"id": "q11", "text": "Can give easy to understand examples of the topic(s)."},
                {"id": "q12", "text": "Demonstrates skills to the class with confidence."},
                {"id": "q13", "text": "Delivers factual (accurate) information in the subject matter."},
                {"id": "q14", "text": "Provide appropriate examples during teaching hours."},
                {"id": "q15", "text": "Demonstrates skills needed to be learned by students comprehensively."},
                {"id": "q16", "text": "Demonstrates ability to organize and execute the lesson."},
            ],
        },
        {
            "partNumber": 4,
            "title": "Part 4: Grooming and Personality <br> The Teacher...",
            "questions": [
                {"id": "q17", "text": "Is well groomed when coming to class."},
                {"id": "q18", "text": "Is wearing proper uniform at times."},
                {"id": "q19", "text": "Welcomes students' inquiries with enthusiasm."},
                {"id": "q20", "text": "Advices students with academic performances and behavioral problems."},
                {"id": "q21", "text": "Instructs students responsibility and respect."},
            ],
        },
        {
            "partNumber": 5,
            "title": "Part 5: Classroom Management <br> The Teacher...",
            "questions": [
                {"id": "q22", "text": "Regularly checks attendance of students."},
                {"id": "q23", "text": "Gives examinations, activities, and tests which are based on the discussed lessons."},
                {"id": "q24", "text": "Uses teaching techniques which are suitable for the student understanding."},
                {"id": "q25", "text": "Encourages students to actively participate in the class discussions."},
                {"id": "q26", "text": "Promotes classroom cleanliness and orderliness."},
                {"id": "q27", "text": "Controls students' misbehavior with utmost responsibility."},
                {"id": "q28", "text": "Encourages students with the proper use of school facilities."},
                {"id": "q29", "text": "Evaluates and comments students performance fairly."},
                {"id": "q30", "text": "Gives feedback on students' performances and ways to improve them."},
                {"id": "q31", "text": "Is creative in developing activities and lessons."},
                {"id": "q32", "text": "Manages class time well."},
                {"id": "q33", "text": "Encourages students to participate in class actively."},
            ],
        },
    ],
    "classroomObservation": [
        {"partNumber": 1, "title": "Domain 1: Content Knowledge and Pedagogy", "questions": [
            {"id": "d1q1", "text": "[Placeholder] Demonstrates mastery of the subject matter."},
            {"id": "d1q2", "text": "[Placeholder] Uses appropriate teaching strategies for the content."},
            {"id": "d1q3", "text": "[Placeholder] Integrates relevant examples to reinforce learning."},
            {"id": "d1q4", "text": "[Placeholder] Applies research-based teaching practices."},
            {"id": "d1q5", "text": "[Placeholder] Utilizes appropriate instructional materials."},
            {"id": "d1q6", "text": "[Placeholder] Encourages critical and analytical thinking."},
        ]},
        {"partNumber": 2, "title": "Domain 2: Learning Environment", "questions": [
            {"id": "d2q1", "text": "[Placeholder] Maintains a safe and orderly classroom."},
            {"id": "d2q2", "text": "[Placeholder] Establishes a positive learning atmosphere."},
            {"id": "d2q3", "text": "[Placeholder] Manages learner behavior constructively."},
            {"id": "d2q4", "text": "[Placeholder] Optimizes the physical learning environment."},
            {"id": "d2q5", "text": "[Placeholder] Encourages learner participation and engagement."},
            {"id": "d2q6", "text": "[Placeholder] Promotes fair and consistent classroom rules."},
        ]},
        {"partNumber": 3, "title": "Domain 3: Diversity of Learners", "questions": [
            {"id": "d3q1", "text": "[Placeholder] Recognizes individual differences among learners."},
            {"id": "d3q2", "text": "[Placeholder] Adjusts teaching approach for diverse needs."},
            {"id": "d3q3", "text": "[Placeholder] Provides support for learners with special needs."},
            {"id": "d3q4", "text": "[Placeholder] Respects learners' cultural backgrounds."},
            {"id": "d3q5", "text": "[Placeholder] Uses differentiated instruction where appropriate."},
            {"id": "d3q6", "text": "[Placeholder] Encourages inclusivity in classroom activities."},
        ]},
        {"partNumber": 4, "title": "Domain 4: Curriculum and Planning", "questions": [
            {"id": "d4q1", "text": "[Placeholder] Aligns lesson objectives with the curriculum."},
            {"id": "d4q2", "text": "[Placeholder] Plans lessons with clear learning outcomes."},
            {"id": "d4q3", "text": "[Placeholder] Sequences lesson content logically."},
            {"id": "d4q4", "text": "[Placeholder] Uses appropriate teaching resources per lesson plan."},
            {"id": "d4q5", "text": "[Placeholder] Adapts plans based on learner progress."},
            {"id": "d4q6", "text": "[Placeholder] Incorporates relevant, updated content."},
        ]},
        {"partNumber": 5, "title": "Domain 5: Assessment and Reporting", "questions": [
            {"id": "d5q1", "text": "[Placeholder] Uses appropriate formative assessment strategies."},
            {"id": "d5q2", "text": "[Placeholder] Provides timely and constructive feedback."},
            {"id": "d5q3", "text": "[Placeholder] Aligns assessment with learning objectives."},
            {"id": "d5q4", "text": "[Placeholder] Uses assessment results to improve instruction."},
            {"id": "d5q5", "text": "[Placeholder] Communicates learner progress clearly."},
            {"id": "d5q6", "text": "[Placeholder] Maintains accurate records of learner performance."},
        ]},
    ],
    "peerToPeer": [
        {"partNumber": 1, "title": "Part 1: Professional Collaboration <br> The Colleague...", "questions": [
            {"id": "pr1", "text": "[Placeholder] Collaborates effectively with fellow faculty members."},
            {"id": "pr2", "text": "[Placeholder] Shares teaching resources and best practices willingly."},
            {"id": "pr3", "text": "[Placeholder] Communicates professionally and respectfully with peers."},
            {"id": "pr4", "text": "[Placeholder] Contributes constructively during department meetings."},
        ]},
        {"partNumber": 2, "title": "Part 2: Work Ethic and Reliability <br> The Colleague...", "questions": [
            {"id": "pr5", "text": "[Placeholder] Meets shared deadlines and commitments reliably."},
            {"id": "pr6", "text": "[Placeholder] Demonstrates accountability for assigned responsibilities."},
            {"id": "pr7", "text": "[Placeholder] Maintains professionalism in the workplace."},
            {"id": "pr8", "text": "[Placeholder] Supports colleagues during high-workload periods."},
        ]},
        {"partNumber": 3, "title": "Part 3: Professional Growth <br> The Colleague...", "questions": [
            {"id": "pr9", "text": "[Placeholder] Shows openness to feedback from peers."},
            {"id": "pr10", "text": "[Placeholder] Actively pursues professional development opportunities."},
            {"id": "pr11", "text": "[Placeholder] Applies new teaching strategies learned from colleagues."},
        ]},
    ],
    "hrEvaluation": [
        {"partNumber": 1, "title": "Document Submission Completeness", "questions": [
            {"id": "p1", "text": "[Placeholder] Submitted all required teaching documents on time."},
            {"id": "p2", "text": "[Placeholder] Lesson plans/instructional materials are complete and up to date."},
            {"id": "p3", "text": "[Placeholder] Grading records and reports submitted as required."},
        ]},
        {"partNumber": 2, "title": "Seminars and Trainings Attended", "questions": [
            {"id": "p4", "text": "[Placeholder] Attended required school-organized seminars/trainings this semester."},
            {"id": "p5", "text": "[Placeholder] Applies learnings from trainings to teaching practice."},
            {"id": "p6", "text": "[Placeholder] Actively participates in professional development opportunities."},
        ]},
    ],
}
 
DEFAULT_SCALE = {
    "scale_labels": [
        {"value": 5, "label": "Always Manifested"},
        {"value": 4, "label": "Often Manifested"},
        {"value": 3, "label": "Sometimes Manifested"},
        {"value": 2, "label": "Rarely Manifested"},
        {"value": 1, "label": "Never Manifested"},
    ],
    "equivalents": [
        {"min": 4.20, "max": 5.00, "label": "Outstanding"},
        {"min": 3.40, "max": 4.19, "label": "Very Satisfactory"},
        {"min": 2.60, "max": 3.39, "label": "Satisfactory"},
        {"min": 1.80, "max": 2.59, "label": "Needs Improvement"},
        {"min": 1.00, "max": 1.79, "label": "Poor"},
    ],
}
 
 
def seed():
    app = create_app()
    with app.app_context():
        if EvaluationType.query.first():
            print("Already seeded (evaluation_types has rows) — skipping.")
            return
 
        type_rows = {}
        for code, label in EVALUATION_TYPES:
            et = EvaluationType(code=code, label=label)
            db.session.add(et)
            type_rows[code] = et
        db.session.flush()
 
        for code, parts in DEFAULT_CRITERIA.items():
            for part in parts:
                criteria = EvaluationCriteria(
                    evaluation_type_id=type_rows[code].id,
                    part_number=part["partNumber"],
                    title=part["title"],
                )
                db.session.add(criteria)
                db.session.flush()
                for order, q in enumerate(part["questions"]):
                    db.session.add(EvaluationQuestion(
                        criteria_id=criteria.id,
                        question_code=q["id"],
                        text=q["text"],
                        display_order=order,
                    ))
 
        for code in type_rows:
            db.session.add(RatingScale(
                evaluation_type_id=type_rows[code].id,
                scale_labels=DEFAULT_SCALE["scale_labels"],
                equivalents=DEFAULT_SCALE["equivalents"],
            ))
 
        db.session.add(EvaluationWeighting())  # uses model defaults: 70/75/25/50/50
 
        db.session.commit()
        print("Seed complete: 4 evaluation types, criteria+questions, rating scales, weighting row.")
 
 
if __name__ == "__main__":
    seed()
 