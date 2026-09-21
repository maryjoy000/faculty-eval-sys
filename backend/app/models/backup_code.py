from datetime import datetime

from ..extensions import db


class BackupCode(db.Model):
    """One-time recovery codes for staff 2FA. Only hashes are stored;
    the plaintext is shown to the user exactly once at generation time.
    """
    __tablename__ = "backup_codes"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    code_hash = db.Column(db.String(255), nullable=False)
    used = db.Column(db.Boolean, default=False, nullable=False)
    used_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    user = db.relationship(
        "User",
        backref=db.backref("backup_codes", lazy=True, cascade="all, delete-orphan"),
    )

    def __repr__(self):
        return f"<BackupCode user_id={self.user_id} used={self.used}>"
