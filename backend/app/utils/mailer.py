"""Minimal SMTP email sender (stdlib only).

Used for password-reset links. Configuration comes from the app config
(MAIL_SERVER / MAIL_PORT / MAIL_USERNAME / MAIL_PASSWORD / MAIL_FROM).
Raises SMTPNotConfigured or an smtplib error on failure so callers can log
the problem without leaking it to the client.
"""
import smtplib
from email.message import EmailMessage

from flask import current_app


class SMTPNotConfigured(RuntimeError):
    """Raised when MAIL_USERNAME / MAIL_PASSWORD are not set."""


def send_email(to_address, subject, body_text):
    server = current_app.config.get("MAIL_SERVER", "smtp.gmail.com")
    port = int(current_app.config.get("MAIL_PORT", 587))
    username = (current_app.config.get("MAIL_USERNAME") or "").strip()
    password = (current_app.config.get("MAIL_PASSWORD") or "").strip()
    sender = (current_app.config.get("MAIL_FROM") or username).strip()
    sender_name = (current_app.config.get("MAIL_FROM_NAME") or "").strip()

    if not username or not password or not sender:
        raise SMTPNotConfigured(
            "MAIL_USERNAME / MAIL_PASSWORD / MAIL_FROM are not configured"
        )

    message = EmailMessage()
    message["From"] = f"{sender_name} <{sender}>" if sender_name else sender
    message["To"] = to_address
    message["Subject"] = subject
    message.set_content(body_text)

    with smtplib.SMTP(server, port, timeout=20) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.login(username, password)
        smtp.send_message(message)
