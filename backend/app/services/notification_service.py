from ..extensions import db
from ..models.notification import Notification


def create_notification(message, user_id=None, student_id=None):
    if not user_id and not student_id:
        raise ValueError("A notification recipient is required.")

    notification = Notification(
        message=message,
        user_id=user_id,
        student_id=student_id,
    )

    db.session.add(notification)
    return notification


def notify_user(user_id, message):
    return create_notification(
        message=message,
        user_id=user_id,
    )


def notify_student(student_id, message):
    return create_notification(
        message=message,
        student_id=student_id,
    )


def notify_users(user_ids, message):
    notifications = []

    for user_id in user_ids:
        notifications.append(
            notify_user(user_id, message)
        )

    return notifications


def notify_students(student_ids, message):
    notifications = []

    for student_id in student_ids:
        notifications.append(
            notify_student(student_id, message)
        )

    return notifications