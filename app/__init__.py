from flask import Flask, redirect, url_for, send_from_directory, request, render_template
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_wtf.csrf import CSRFProtect
from datetime import datetime
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_mail import Mail
import logging
from logging.handlers import RotatingFileHandler
import os

# Initialize extensions globally
db = SQLAlchemy()
login_manager = LoginManager()
mail = Mail()
csrf = CSRFProtect()


def setup_logging(app):
    """Configure application logging"""
    # Create logs directory if it doesn't exist
    log_dir = app.config.get('LOG_FOLDER', 'logs')
    os.makedirs(log_dir, exist_ok=True)
    
    log_file = os.path.join(log_dir, app.config.get('LOG_FILENAME', 'nas.log'))
    max_size = app.config.get('LOG_MAX_SIZE', 10 * 1024 * 1024)  # 10MB default
    backup_count = app.config.get('LOG_BACKUP_COUNT', 5)
    
    # Create file handler with rotation
    file_handler = RotatingFileHandler(
        log_file,
        maxBytes=max_size,
        backupCount=backup_count
    )
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    ))
    
    # Create console handler for development
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.DEBUG if app.debug else logging.WARNING)
    console_handler.setFormatter(logging.Formatter(
        '%(levelname)s - %(name)s - %(message)s'
    ))
    
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG if app.debug else logging.INFO)
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)
    
    # Also add to Flask's logger
    app.logger.addHandler(file_handler)
    app.logger.addHandler(console_handler)
    
    app.logger.info('NAS application logging initialized')


def create_app():
    app = Flask(__name__)

    # Load config first
    from app.config import Config
    app.config.from_object(Config)
    
    # Setup logging
    setup_logging(app)

    # Init core extensions
    db.init_app(app)
    login_manager.init_app(app)
    mail.init_app(app)
    csrf.init_app(app)

    # Init email utils (uses mail)
    from app.utils.email_utils import init_mail
    init_mail(app)

    # Secure cookies - SECURE should only be True when HTTPS is configured
    # Default to False to support both HTTP (local network) and HTTPS (public)
    # Can be overridden in config when HTTPS is set up
    use_secure_cookies = app.config.get('SESSION_COOKIE_SECURE', False)
    
    app.config.update(
        SESSION_COOKIE_SECURE=use_secure_cookies,  # Only True when HTTPS is configured
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE='Lax',  # 'Strict' can break OAuth flows
        SESSION_COOKIE_DOMAIN=None  # Allow cookies across network (don't restrict to localhost)
    )

    # Proxy fix for proper header forwarding
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

    # Login manager config
    login_manager.login_view = 'auth.login'
    login_manager.login_message_category = 'info'

    from app.models import User

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    with app.app_context():
        # Avoid circular imports
        from app.models import check_and_update_tables, initialize_system_tags, initialize_default_roles

        db.create_all()
        check_and_update_tables()
        initialize_system_tags()
        initialize_default_roles()

        # Register blueprints
        from app.routes.auth import auth_bp
        from app.routes.admin import admin_bp
        from app.routes.files import files_bp
        from app.routes.groups import groups_bp
        from app.routes.settings import settings_bp
        from app.routes.api import api_bp
        from app.routes.share import share_bp
        from app.routes.setup import setup_bp
        from app.routes.trash import trash_bp

        app.register_blueprint(auth_bp, name='auth')
        app.register_blueprint(admin_bp, name='admin')
        app.register_blueprint(files_bp, name='files')
        app.register_blueprint(settings_bp, name='settings')
        app.register_blueprint(groups_bp, name='groups')
        app.register_blueprint(api_bp, name='api')
        csrf.exempt(share_bp)  # Public share routes don't need CSRF
        app.register_blueprint(share_bp, name='share')
        app.register_blueprint(setup_bp, name='setup')
        app.register_blueprint(trash_bp, name='trash')
        
        # Initialize background task scheduler for cleanup tasks
        from app.utils.scheduler import init_scheduler
        init_scheduler(app)
        
        # AI Dashboard - disabled until dependencies are properly configured
        # Requires: PyMuPDF (fitz), python-docx, and external AI service
        # To enable: uncomment the lines below and add dependencies to requirements.txt
        # from app.routes.ai_dashboard import ai_bp
        # app.register_blueprint(ai_bp, name='ai')

        @app.route('/')
        def index():
            # Serve React app with CSRF token injected
            from flask_wtf.csrf import generate_csrf
            react_folder = os.path.join(app.static_folder, 'react')
            index_path = os.path.join(react_folder, 'index.html')
            
            # Read the index.html file
            with open(index_path, 'r', encoding='utf-8') as f:
                html_content = f.read()
            
            # Inject CSRF token into meta tag
            csrf_token = generate_csrf()
            html_content = html_content.replace(
                '<meta name="csrf-token" content="">',
                f'<meta name="csrf-token" content="{csrf_token}">'
            )
            
            return html_content
        
        @app.route('/react/')
        @app.route('/react/<path:path>')
        def serve_react(path='index.html'):
            """Serve React SPA - handles client-side routing"""
            react_folder = os.path.join(app.static_folder, 'react')
            if path and os.path.exists(os.path.join(react_folder, path)):
                return send_from_directory(react_folder, path)
            return send_from_directory(react_folder, 'index.html')
        
        @app.route('/dashboard')
        def dashboard_redirect():
            """Redirect old dashboard to React"""
            return redirect(url_for('index'))
        
        # Catch-all routes for React SPA client-side routing
        # These routes serve the React app for frontend routes
        @app.route('/login')
        @app.route('/register')
        @app.route('/admin')
        @app.route('/admin/logs')
        @app.route('/notes')
        @app.route('/settings/theme')
        @app.route('/profile')
        @app.route('/settings/server')
        @app.route('/trash')
        def serve_react_routes():
            """Serve React app for client-side routes"""
            from flask_wtf.csrf import generate_csrf
            react_folder = os.path.join(app.static_folder, 'react')
            index_path = os.path.join(react_folder, 'index.html')
            
            with open(index_path, 'r', encoding='utf-8') as f:
                html_content = f.read()
            
            csrf_token = generate_csrf()
            html_content = html_content.replace(
                '<meta name="csrf-token" content="">',
                f'<meta name="csrf-token" content="{csrf_token}">'
            )
            
            return html_content

        @app.after_request
        def add_security_headers(response):
            response.headers.setdefault('X-Content-Type-Options', 'nosniff')
            response.headers.setdefault('X-Frame-Options', 'DENY')
            response.headers.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
            # Use setdefault so routes serving untrusted user files can apply a
            # stricter sandbox CSP without being overwritten here.
            response.headers.setdefault('Content-Security-Policy', (
                "default-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; "
                "script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com 'unsafe-inline'; "
                "style-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com 'unsafe-inline'; "
                "img-src 'self' data:; "
                "font-src 'self' https://cdnjs.cloudflare.com; "
                "connect-src 'self';"
            ))
            return response

    @app.context_processor
    def utility_processor():
        return {'current_year': datetime.utcnow().year}

    @app.context_processor
    def add_utility_functions():
        from app.config import Config
        return {'format_size': Config.format_size}

    return app



    
