from flask import Flask, jsonify
from flask_cors import CORS

from .config import Config
from .extensions import db, migrate, login_manager
from .routes.health import health_bp
from .routes.auth import auth_bp
from .routes.faculty import faculty_bp
from .routes.advisory import advisory_bp
from .routes.accounts import accounts_bp
from .routes.criteria import criteria_bp
from .routes.rating_scales import rating_scales_bp
from .routes.weighting import weighting_bp
from .routes.periods import periods_bp
from .routes.evaluations import evaluations_bp
from .routes.reports import reports_bp
from .routes.notifications import notifications_bp
from .routes.activity_logs import activity_logs_bp
from .routes.analytics import analytics_bp
from .routes.profile import profile_bp
from .routes.two_factor import two_factor_bp
from .routes.system_settings import system_settings_bp

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    CORS(
        app,
        supports_credentials=True,
        origins=Config.CORS_ORIGINS,
    )

    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)

    from .models import (
        user, faculty, advisory, student,
        evaluation_type, evaluation_period, rating_scale, weighting, criteria,
        evaluation, notification, faculty_report, activity_log, system_setting,
        backup_code,
    )  # noqa: F401

    from .models.user import User
    from .models.student import Student

    @login_manager.user_loader
    def load_user(composite_id):
        kind, _, raw_id = composite_id.partition(":")
        if kind == "user":
            return User.query.get(int(raw_id))
        if kind == "student":
            return Student.query.get(int(raw_id))
        return None

    @login_manager.unauthorized_handler
    def unauthorized():
        return jsonify({"error": "Not authenticated"}), 401

    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(faculty_bp, url_prefix="/api/faculty")
    app.register_blueprint(advisory_bp, url_prefix="/api/advisory")
    app.register_blueprint(accounts_bp, url_prefix="/api/accounts")
    app.register_blueprint(criteria_bp, url_prefix="/api/evaluation-criteria")
    app.register_blueprint(rating_scales_bp, url_prefix="/api/rating-scales")
    app.register_blueprint(weighting_bp, url_prefix="/api/evaluation-weightings")
    app.register_blueprint(periods_bp, url_prefix="/api/evaluation-periods")
    app.register_blueprint(evaluations_bp, url_prefix="/api/evaluations")
    app.register_blueprint(reports_bp, url_prefix="/api/reports")
    app.register_blueprint(notifications_bp, url_prefix="/api/notifications")
    app.register_blueprint(activity_logs_bp, url_prefix="/api/activity-logs")
    app.register_blueprint(analytics_bp, url_prefix="/api/analytics")
    app.register_blueprint(profile_bp, url_prefix="/api/profile")
    app.register_blueprint(two_factor_bp, url_prefix="/api/2fa")
    app.register_blueprint(system_settings_bp, url_prefix="/api/system-settings")
    
    return app