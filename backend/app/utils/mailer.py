"""Transactional email sender via the Resend HTTP API (stdlib only).

Used for password-reset links. Configuration comes from the app config
(RESEND_API_KEY / MAIL_FROM / MAIL_FROM_NAME). Raises EmailNotConfigured
or a RuntimeError on failure so callers can log the problem without
leaking it to the client.
"""
import json
import urllib.error
import urllib.request

from flask import current_app

RESEND_API_URL = "https://api.resend.com/emails"


class EmailNotConfigured(RuntimeError):
    """Raised when RESEND_API_KEY / MAIL_FROM are not set."""


# Backwards-compatible alias (previous SMTP-based name).
SMTPNotConfigured = EmailNotConfigured


def send_email(to_address, subject, body_text):
    api_key = (current_app.config.get("RESEND_API_KEY") or "").strip()
    sender = (current_app.config.get("MAIL_FROM") or "").strip()
    sender_name = (current_app.config.get("MAIL_FROM_NAME") or "").strip()

    if not api_key or not sender:
        raise EmailNotConfigured(
            "RESEND_API_KEY / MAIL_FROM are not configured"
        )

    recipient = (to_address or "").strip()
    if not recipient:
        raise EmailNotConfigured("No recipient address for this account")

    payload = {
        "from": f"{sender_name} <{sender}>" if sender_name else sender,
        "to": [recipient],
        "subject": subject,
        "text": body_text,
    }

    request = urllib.request.Request(
        RESEND_API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            # Default "Python-urllib/*" agents get challenged by bot
            # protection in front of the API (HTTP 403); identify plainly.
            "User-Agent": "FES-Backend/1.0 (+https://headwaters-fes.tech)",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            if response.status not in (200, 201):
                raise RuntimeError(
                    f"Resend API error: unexpected status {response.status}"
                )
    except urllib.error.HTTPError as exc:
        try:
            detail = exc.read().decode("utf-8", "replace")[:300]
        except Exception:
            detail = ""
        raise RuntimeError(
            f"Resend API error {exc.code}: {detail or exc.reason}"
        )
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Resend request failed: {exc.reason}")
