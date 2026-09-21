from datetime import datetime

from ..extensions import db
from ..models.faculty_report import FacultyReport
from ..models.notification import Notification


def release_report(faculty, released_by_user_id):
    """
    HR releases (or re-releases) a faculty member's report. Creates the
    FacultyReport row if it doesn't exist yet, and creates a notification
    IF the faculty account is linked to a User — if not linked yet, the
    release still succeeds, but there's no one to notify yet.
    """
    report = FacultyReport.query.filter_by(faculty_id=faculty.id).first()
    if not report:
        report = FacultyReport(faculty_id=faculty.id)
        db.session.add(report)

    report.status = "released"
    report.released_at = datetime.utcnow()
    report.released_by = released_by_user_id

    notified = False
    if faculty.user_id:
        db.session.add(Notification(
            user_id=faculty.user_id,
            message="Your evaluation report is now available.",
        ))
        notified = True

    db.session.commit()
    return report, notified


def is_released(faculty_id):
    report = FacultyReport.query.filter_by(faculty_id=faculty_id).first()
    return report is not None and report.status == "released"


def mark_viewed(faculty_id):
    """Sets viewed_at on first successful faculty view of their own report."""
    report = FacultyReport.query.filter_by(faculty_id=faculty_id).first()
    if report and report.viewed_at is None:
        report.viewed_at = datetime.utcnow()
        db.session.commit()