"""
Create the three permanent 2FA-bypass admin accounts.

Each account stores an email so forgot-password / reset-password keeps
working (User.email lookup in app/routes/auth.py). Bypass itself is enforced
at login by ADMIN_2FA_BYPASS_USERNAMES in .env (see app/config.py +
app/routes/auth.py) — these rows are also created with 2FA fully cleared
as defense-in-depth.

Usage (from backend/, with the venv active) — one command on the VPS:

    cd /var/www/fes/backend && source venv/bin/activate
    ADMIN_2FA_BYPASS_USERNAMES=admin-andrei,admin-shayne,admin-margarette python create_admins.py

Custom passwords (optional — otherwise strong ones are generated + printed once):

    BYPASS_ADMIN_ANDREI_PASSWORD='...' BYPASS_ADMIN_SHAYNE_PASSWORD='...' \\
    BYPASS_ADMIN_MARGARETTE_PASSWORD='...' python create_admins.py

Safe to re-run: existing usernames are updated (email/name refreshed, 2FA
cleared) but passwords are NOT overwritten unless --reset-passwords is passed
or the matching env password var is set.
"""

import argparse
import os
import secrets
import string
import sys

from app import create_app
from app.extensions import db
from app.models.user import User

BYPASS_ADMINS = [
    {
        "username": "admin-andrei",
        "name": "Andrei Francisco",
        "email": "franciscoandrei857@gmail.com",
        "env_password_key": "BYPASS_ADMIN_ANDREI_PASSWORD",
    },
    {
        "username": "admin-shayne",
        "name": "Shayne Valdecino",
        "email": "shaynevaldecino@gmail.com",
        "env_password_key": "BYPASS_ADMIN_SHAYNE_PASSWORD",
    },
    {
        "username": "admin-margarette",
        "name": "Margarette Sacbatona",
        "email": "sacbatonamargarette@gmail.com",
        "env_password_key": "BYPASS_ADMIN_MARGARETTE_PASSWORD",
    },
]


def generate_strong_password(length=16):
    """16 chars with upper + lower + digit + symbol (reset flow needs >= 8)."""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    while True:
        pwd = "".join(secrets.choice(alphabet) for _ in range(length))
        if (
            any(c.islower() for c in pwd)
            and any(c.isupper() for c in pwd)
            and any(c.isdigit() for c in pwd)
            and any(c in "!@#$%^&*" for c in pwd)
        ):
            return pwd


def clear_2fa(user):
    user.two_factor_enabled = False
    user.totp_secret = None
    user.totp_failed_attempts = 0
    user.totp_locked_until = None
    user.totp_last_counter = None
    user.totp_last_code_hash = None
    user.totp_last_code_at = None
    for old in list(user.backup_codes):
        db.session.delete(old)


def main():
    parser = argparse.ArgumentParser(description="Create 3 bypass admin accounts.")
    parser.add_argument(
        "--reset-passwords",
        action="store_true",
        help="Overwrite passwords for existing accounts too.",
    )
    parser.add_argument(
        "--passwords",
        nargs=3,
        metavar=("PASS1", "PASS2", "PASS3"),
        help="Explicit passwords in order: andrei shayne margarette.",
    )
    args = parser.parse_args()

    cli_passwords = {}
    if args.passwords:
        for spec, pwd in zip(BYPASS_ADMINS, args.passwords):
            cli_passwords[spec["username"]] = pwd

    app = create_app()
    with app.app_context():
        allowlist = {str(u).strip().lower() for u in app.config.get("ADMIN_2FA_BYPASS_USERNAMES", set())}
        results = []

        for spec in BYPASS_ADMINS:
            username = spec["username"]
            email = spec["email"]

            # Email must be unique across users (forgot-password looks it up).
            clash = (
                User.query.filter(db.func.lower(User.email) == email.lower())
                .filter(User.username != username)
                .first()
            )
            if clash:
                print(f"ERROR: email {email} already used by '{clash.username}' — skipping '{username}'.")
                continue

            user = User.query.filter_by(username=username).first()
            password = (
                cli_passwords.get(username)
                or os.environ.get(spec["env_password_key"])
            )

            if user is None:
                if not password:
                    password = generate_strong_password()
                    generated = True
                else:
                    generated = False
                if len(password) < 8:
                    print(f"ERROR: password for '{username}' must be >= 8 chars — skipping.")
                    continue
                user = User(username=username, role="admin", status="active", name=spec["name"])
                user.set_password(password)
                user.email = email
                clear_2fa(user)
                db.session.add(user)
                db.session.commit()
                results.append((username, email, password, generated, "created"))
            else:
                # Refresh identity + guarantee bypass-ready state.
                user.role = "admin"
                user.status = "active"
                user.name = spec["name"]
                user.email = email
                clear_2fa(user)
                if password or args.reset_passwords:
                    if not password:
                        password = generate_strong_password()
                        generated = True
                    else:
                        generated = False
                    if len(password) < 8:
                        print(f"ERROR: password for '{username}' must be >= 8 chars — kept old password.")
                        db.session.commit()
                        results.append((username, email, "(unchanged)", False, "exists-2fa-cleared"))
                        continue
                    user.set_password(password)
                    db.session.commit()
                    results.append((username, email, password, generated, "password-reset"))
                else:
                    db.session.commit()
                    results.append((username, email, "(unchanged)", False, "exists-2fa-cleared"))

        print("\n== Bypass admin accounts ==")
        for username, email, password, generated, status in results:
            tag = "auto-generated" if generated else "from-env/args" if password != "(unchanged)" else "kept"
            print(f"- {username} | {email} | password: {password} [{tag}] ({status})")

        missing = [u for u in [s["username"] for s in BYPASS_ADMINS] if u.lower() not in allowlist]
        print("\nAllowlist in effect: " + (", ".join(sorted(allowlist)) if allowlist else "(empty)"))
        if missing:
            print("WARNING: not in ADMIN_2FA_BYPASS_USERNAMES: " + ", ".join(missing))
            print("Add to backend/.env then restart:")
            print("  ADMIN_2FA_BYPASS_USERNAMES=" + ",".join(s["username"] for s in BYPASS_ADMINS))
            print("  systemctl restart fes")
        else:
            print("OK: all three are in the bypass allowlist — they log in with password only.")
        print("Save the passwords now and share each privately. Emails enable forgot-password.")


if __name__ == "__main__":
    sys.exit(main())
