import os
from urllib.parse import quote_plus
from dotenv import load_dotenv

load_dotenv()


class Config:
    """
    Central app configuration, loaded from environment variables (.env).
    Per Senior Developer Rule #29: never hardcode credentials here.
    """

    SECRET_KEY = os.environ.get("SECRET_KEY")
    if not SECRET_KEY:
        raise RuntimeError("SECRET_KEY environment variable is required")

    # Database configuration
    DATABASE_URL = os.environ.get("DATABASE_URL")

    if DATABASE_URL:
        SQLALCHEMY_DATABASE_URI = DATABASE_URL
    else:
        DB_USER = os.environ.get("DB_USER")
        DB_PASSWORD = os.environ.get("DB_PASSWORD")
        DB_HOST = os.environ.get("DB_HOST")
        DB_PORT = os.environ.get("DB_PORT", "3306")
        DB_NAME = os.environ.get("DB_NAME")

        if not all([DB_USER, DB_PASSWORD, DB_HOST, DB_NAME]):
            raise RuntimeError(
                "Database configuration is incomplete. "
                "Set DATABASE_URL or DB_USER, DB_PASSWORD, DB_HOST, and DB_NAME."
            )

        SQLALCHEMY_DATABASE_URI = (
            f"mysql+pymysql://"
            f"{quote_plus(DB_USER)}:{quote_plus(DB_PASSWORD)}"
            f"@{DB_HOST}:{DB_PORT}/{DB_NAME}"
        )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    

    # Session / cookie behavior for Flask-Login (Phase 4). Session-based auth
    # means the frontend must send fetch() requests with credentials: "include".
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SECURE = os.environ.get("SESSION_COOKIE_SECURE", "false").lower() == "true"
    SESSION_COOKIE_SAMESITE = os.environ.get("SESSION_COOKIE_SAMESITE", "Lax")

    CORS_ORIGINS = [
        origin.strip()
        for origin in os.environ.get(
            "CORS_ORIGINS",
            "http://127.0.0.1:5500,http://localhost:5500"
        ).split(",")
        if origin.strip()
    ]
