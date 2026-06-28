"""
Setup wizard routes for first-time configuration
"""
from flask import Blueprint, render_template, request, jsonify, redirect, url_for, current_app
from flask_login import login_required, current_user
from app.models import db, User, Role, SystemConfig, ActivityLog
from app.utils.security_utils import get_client_ip
from datetime import datetime
from functools import wraps
import os
import logging

logger = logging.getLogger(__name__)

setup_bp = Blueprint('setup', __name__, url_prefix='/setup')


def setup_required(f):
    """Decorator to check if setup is complete"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if SystemConfig.is_setup_complete():
            return redirect(url_for('index'))
        return f(*args, **kwargs)
    return decorated_function


def admin_required(f):
    """Decorator to require admin access"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or not current_user.is_admin:
            return jsonify({'error': 'Admin access required'}), 403
        return f(*args, **kwargs)
    return decorated_function


@setup_bp.route('/')
def setup_wizard():
    """Serve the setup wizard page"""
    if SystemConfig.is_setup_complete():
        return redirect(url_for('index'))
    
    # Serve React app for setup
    from flask_wtf.csrf import generate_csrf
    react_folder = os.path.join(current_app.static_folder, 'react')
    index_path = os.path.join(react_folder, 'index.html')
    
    try:
        with open(index_path, 'r', encoding='utf-8') as f:
            html_content = f.read()
        
        csrf_token = generate_csrf()
        html_content = html_content.replace(
            '<meta name="csrf-token" content="">',
            f'<meta name="csrf-token" content="{csrf_token}">'
        )
        return html_content
    except FileNotFoundError:
        return render_template('setup/wizard.html')


@setup_bp.route('/api/status')
def setup_status():
    """Check if setup is complete and return current status"""
    try:
        setup_complete = SystemConfig.is_setup_complete()
        admin_exists = User.query.filter_by(is_admin=True).first() is not None
        
        return jsonify({
            'setup_complete': setup_complete,
            'admin_exists': admin_exists,
            'current_step': SystemConfig.get('setup_current_step', 1)
        })
    except Exception as e:
        # Database might not exist yet
        return jsonify({
            'setup_complete': False,
            'admin_exists': False,
            'current_step': 1,
            'error': str(e)
        })


@setup_bp.route('/api/app-config')
def get_app_config():
    """Get public app configuration (app name, etc.) - no auth required"""
    try:
        return jsonify({
            'app_name': SystemConfig.get('app_name', 'NAS System'),
            'allow_registration': SystemConfig.get('allow_registration', True),
            'demo_enabled': SystemConfig.get('demo_enabled', False)
        })
    except Exception as e:
        return jsonify({
            'app_name': 'NAS System',
            'allow_registration': True,
            'demo_enabled': False
        })


@setup_bp.route('/api/complete', methods=['POST'])
def complete_setup():
    """Complete the initial setup"""
    # Security: this endpoint creates the first admin account and is
    # unauthenticated. Once setup is complete (or an admin already exists), it
    # MUST be locked down, otherwise anyone could create additional admin
    # accounts (privilege escalation / backdoor).
    if SystemConfig.is_setup_complete() or User.query.filter_by(is_admin=True).first() is not None:
        return jsonify({'error': 'Setup has already been completed.'}), 403

    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    try:
        # Read admin credentials: prefer request body, fall back to .env
        admin_username = data.get('admin_username') or os.environ.get('ADMIN_USERNAME') or 'admin'
        admin_password = data.get('admin_password') or os.environ.get('ADMIN_PASSWORD')
        admin_email = data.get('admin_email') or os.environ.get('ADMIN_EMAIL') or 'admin@localhost'
        
        if not admin_password:
            return jsonify({'error': 'Admin password is required. Set it in the form or ADMIN_PASSWORD in .env'}), 400
        
        from app.utils.security_utils import validate_password_strength
        pw_ok, pw_msg = validate_password_strength(admin_password)
        if not pw_ok:
            return jsonify({'error': pw_msg}), 400
        
        # Check if admin already exists
        existing_admin = User.query.filter_by(username=admin_username).first()
        if existing_admin:
            return jsonify({'error': f'User {admin_username} already exists'}), 400
        
        # Create admin user
        admin = User(
            username=admin_username,
            email=admin_email,
            is_admin=True,
            is_approved=True,
            is_demo=False,
            storage_limit=50 * 1024 * 1024 * 1024,  # 50GB
            storage_used=0,
            storage_tier='pro',
            created_at=datetime.utcnow()
        )
        admin.set_password(admin_password)
        db.session.add(admin)
        
        # Create demo user if enabled (via form or .env)
        demo_enabled = data.get('demo_enabled', False) or bool(os.environ.get('DEMO_USERNAME'))
        if demo_enabled:
            demo_username = data.get('demo_username') or os.environ.get('DEMO_USERNAME') or 'demo'
            demo_password = data.get('demo_password') or os.environ.get('DEMO_PASSWORD') or 'demo123'
            demo_email = data.get('demo_email') or os.environ.get('DEMO_EMAIL') or f'{demo_username}@localhost'
            
            existing_demo = User.query.filter_by(username=demo_username).first()
            if not existing_demo:
                demo = User(
                    username=demo_username,
                    email=demo_email,
                    is_admin=False,
                    is_approved=True,
                    is_demo=True,
                    storage_limit=1 * 1024 * 1024 * 1024,  # 1GB
                    storage_used=0,
                    storage_tier='demo',
                    created_at=datetime.utcnow()
                )
                demo.set_password(demo_password)
                db.session.add(demo)
                db.session.flush()  # Get demo.id
                
                # Link demo user to the demo role so quota updates propagate
                demo_role = Role.query.filter_by(name='demo').first()
                if demo_role:
                    demo.role_id = demo_role.id
                    demo.role = demo_role.name
                    demo.storage_limit = demo_role.storage_quota
                db.session.commit()
        
        # Save configuration settings
        config_settings = {
            'setup_complete': ('true', 'bool', 'general'),
            'app_name': (data.get('app_name', 'NAS System'), 'string', 'general'),
            'app_port': (str(data.get('app_port', 5000)), 'int', 'general'),
            'file_storage_path': (data.get('file_storage_path', 'files'), 'string', 'storage'),
            'database_path': (data.get('database_path', 'instance/nas.db'), 'string', 'storage'),
            'demo_enabled': ('true' if demo_enabled else 'false', 'bool', 'general'),
            'demo_cleanup_hours': (str(data.get('demo_cleanup_hours', 24)), 'int', 'general'),
            'trash_retention_days': (str(data.get('trash_retention_days', 30)), 'int', 'storage'),
            'require_email_verification': ('true' if data.get('require_email_verification') else 'false', 'bool', 'email'),
            'allow_registration': ('true' if data.get('allow_registration', True) else 'false', 'bool', 'security'),
            'require_admin_approval': ('true' if data.get('require_admin_approval', True) else 'false', 'bool', 'security'),
            'account_activation_mode': (data.get('account_activation_mode') or os.environ.get('ACCOUNT_ACTIVATION_MODE', 'admin_approval'), 'string', 'security'),
        }
        
        for key, (value, value_type, category) in config_settings.items():
            SystemConfig.set(key, value, value_type=value_type, category=category)
        
        # Save email settings if provided
        if data.get('email_enabled'):
            email_settings = {
                'email_enabled': ('true', 'bool', 'email'),
                'email_server': (data.get('email_server', ''), 'string', 'email'),
                'email_port': (str(data.get('email_port', 587)), 'int', 'email'),
                'email_username': (data.get('email_username', ''), 'string', 'email'),
                'email_password': (data.get('email_password', ''), 'string', 'email'),
                'email_sender_name': (data.get('email_sender_name', 'NAS System'), 'string', 'email'),
                'email_use_tls': ('true' if data.get('email_use_tls', True) else 'false', 'bool', 'email'),
            }
            for key, (value, value_type, category) in email_settings.items():
                is_sensitive = key == 'email_password'
                SystemConfig.set(key, value, value_type=value_type, category=category, is_sensitive=is_sensitive)
        
        # Log the setup completion
        log = ActivityLog(
            user_id=admin.id,
            action='setup_complete',
            ip_address=get_client_ip(),
            details='Initial system setup completed',
            timestamp=datetime.utcnow()
        )
        db.session.add(log)
        db.session.commit()
        
        logger.info(f'Setup completed by {admin_username}')
        
        return jsonify({
            'success': True,
            'message': 'Setup completed successfully',
            'redirect': '/login'
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f'Setup failed: {str(e)}')
        return jsonify({'error': f'Setup failed: {str(e)}'}), 500


# Admin settings API endpoints
@setup_bp.route('/api/settings', methods=['GET'])
@admin_required
def get_settings():
    """Get all system settings grouped by category"""
    from app.utils.default_settings import DEFAULT_SETTINGS, initialize_default_settings
    
    # Initialize defaults if needed
    if SystemConfig.query.count() == 0:
        initialize_default_settings(db, SystemConfig)
    
    settings = SystemConfig.query.all()
    
    # Group by category
    grouped = {}
    for setting in settings:
        category = setting.category or 'general'
        if category not in grouped:
            grouped[category] = {}
        
        grouped[category][setting.key] = {
            'value': '[HIDDEN]' if setting.is_sensitive else setting.value,
            'value_type': setting.value_type,
            'description': setting.description,
            'is_sensitive': setting.is_sensitive
        }
    
    # Ensure all default categories exist
    for category in DEFAULT_SETTINGS.keys():
        if category not in grouped:
            grouped[category] = {}
    
    return jsonify(grouped)


@setup_bp.route('/api/settings', methods=['POST'])
@login_required
@admin_required
def update_settings():
    """Update system settings"""
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    try:
        updated = []
        for key, value in data.items():
            # Skip [HIDDEN] values - don't overwrite sensitive data with placeholder
            if value == '[HIDDEN]':
                continue
            
            # Skip empty strings for sensitive fields (means no change)
            existing = SystemConfig.query.filter_by(key=key).first()
            if existing:
                value_type = existing.value_type
                category = existing.category
                is_sensitive = existing.is_sensitive
                
                # Skip empty values for sensitive fields
                if is_sensitive and (value == '' or value is None):
                    continue
            else:
                value_type = 'string'
                category = 'general'
                is_sensitive = False
            
            # Convert boolean strings properly
            if value_type == 'bool':
                if isinstance(value, str):
                    value = value.lower() in ('true', '1', 'yes', 'on')
            
            SystemConfig.set(
                key, value,
                value_type=value_type,
                category=category,
                is_sensitive=is_sensitive,
                updated_by=current_user.id
            )
            updated.append(key)
        
        # Log the change
        log = ActivityLog(
            user_id=current_user.id,
            action='settings_update',
            ip_address=get_client_ip(),
            details=f'Updated settings: {", ".join(updated)}',
            timestamp=datetime.utcnow()
        )
        db.session.add(log)
        db.session.commit()
        
        return jsonify({'success': True, 'updated': updated})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@setup_bp.route('/api/settings/<key>')
@login_required
@admin_required
def get_setting(key):
    """Get a specific setting"""
    config = SystemConfig.query.filter_by(key=key).first()
    if not config:
        return jsonify({'error': 'Setting not found'}), 404
    
    return jsonify(config.to_dict(include_sensitive=current_user.is_admin))


@setup_bp.route('/api/test-email', methods=['POST'])
@login_required
@admin_required
def test_email():
    """Test email configuration"""
    data = request.get_json()
    
    try:
        from app.utils.email_utils import send_test_email
        result = send_test_email(data.get('recipient', current_user.email))
        
        if result:
            return jsonify({'success': True, 'message': 'Test email sent successfully'})
        else:
            return jsonify({'success': False, 'message': 'Failed to send test email'}), 500
            
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500
