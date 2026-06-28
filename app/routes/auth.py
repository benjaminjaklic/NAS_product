from flask import Blueprint, render_template, redirect, url_for, flash, request, current_app, jsonify
from flask_login import login_user, logout_user, login_required, current_user
from werkzeug.urls import url_parse
from app.models import db, User, ActivityLog, SystemConfig
from app.utils.security_utils import get_client_ip, validate_password_strength, is_valid_email
from app.utils.rate_limiter import rate_limit_login, rate_limit
from datetime import datetime
import os
import logging

logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth', __name__, url_prefix='/auth')

# Remove root route to avoid conflict with main app route

@auth_bp.route('/login', methods=['GET', 'POST'])
@rate_limit_login(max_attempts=5, lockout_seconds=300)
def login():
    if current_user.is_authenticated:
        return redirect(url_for('files.dashboard'))
    
    # GET request - redirect to React login page
    if request.method == 'GET':
        return redirect('/login')
    
    # POST request - handle login
    logger.info(f"Login attempt from {get_client_ip()}, Content-Type: {request.content_type}")
    username = request.form.get('username')
    password = request.form.get('password')
    remember = True if request.form.get('remember') else False
    
    user = User.query.filter_by(username=username).first()
    
    if not user or not user.check_password(password):
        flash('Invalid username or password', 'danger')
        return redirect('/login')
    
    if not user.is_approved and not user.is_admin:
        flash('Your account is pending approval', 'warning')
        return redirect('/login')
    
    login_user(user, remember=remember)
    
    # Log activity
    ip = get_client_ip()
    log = ActivityLog(
        user_id=user.id,
        action='login',
        ip_address=ip,
        details='Successful login',
        timestamp=datetime.utcnow()
    )
    db.session.add(log)
    
    # Update last login
    user.last_login = datetime.utcnow()
    db.session.commit()
    
    # Send login notification email (non-blocking, fails silently)
    try:
        from app.utils.email_utils import send_login_notification
        send_login_notification(user, ip_address=ip)
    except Exception:
        pass
    
    logger.info(f"User {user.username} logged in from {ip}")
    
    next_page = request.args.get('next')
    if not next_page or url_parse(next_page).netloc != '':
        next_page = url_for('files.dashboard')
    return redirect(next_page)

@auth_bp.route('/register', methods=['GET', 'POST'])
@rate_limit(max_requests=10, window_seconds=300)
def register():
    if current_user.is_authenticated:
        return redirect(url_for('files.dashboard'))
    
    # GET request - redirect to React register page
    if request.method == 'GET':
        return redirect('/register')
    
    # POST request - handle registration
    username = request.form.get('username')
    email = request.form.get('email')
    password = request.form.get('password')
    confirm_password = request.form.get('confirm_password')
    
    # Validate input
    if not email or not username or not password:
        flash('All fields are required', 'danger')
        return redirect('/register')

    if not is_valid_email(email):
        flash('Please enter a valid email address', 'danger')
        return redirect('/register')

    if password != confirm_password:
        flash('Passwords do not match', 'danger')
        return redirect('/register')

    pw_ok, pw_msg = validate_password_strength(password)
    if not pw_ok:
        flash(pw_msg, 'danger')
        return redirect('/register')
    
    # Check if user exists
    if User.query.filter_by(username=username).first():
        flash('Username already exists', 'danger')
        return redirect('/register')
    
    if User.query.filter_by(email=email).first():
        flash('Email already registered', 'danger')
        return redirect('/register')
    
    # Determine account activation mode
    activation_mode = 'admin_approval'  # safe default
    try:
        activation_mode = SystemConfig.get('account_activation_mode', 'admin_approval')
    except Exception:
        pass
    
    # Set approval status based on activation mode
    auto_approve = activation_mode in ('none', 'email_verification')
    
    # Create new user
    new_user = User(
        username=username,
        email=email,
        is_approved=auto_approve,
        storage_limit=current_app.config['DEFAULT_STORAGE_LIMIT'],
        storage_used=0,
        created_at=datetime.utcnow()
    )
    new_user.set_password(password)
    
    try:
        db.session.add(new_user)
        db.session.commit()
        
        # Create user storage directory
        user_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], str(new_user.id))
        os.makedirs(user_dir, exist_ok=True)
        
        # Send verification email if mode requires it
        if activation_mode in ('email_verification', 'both'):
            try:
                from app.utils.email_utils import send_verification_email
                send_verification_email(new_user)
                logger.info(f"Verification email sent to {new_user.email}")
            except Exception as email_err:
                logger.error(f"Failed to send verification email: {email_err}")
        
        # Notify admins of new registration if approval is needed
        if activation_mode in ('admin_approval', 'both'):
            try:
                from app.utils.email_utils import send_admin_notification
                send_admin_notification(
                    subject='New User Registration',
                    message=f'User "{username}" ({email}) has registered and is awaiting approval.'
                )
            except Exception:
                pass  # Non-critical
        
        # Log activity
        log = ActivityLog(
            user_id=new_user.id,
            action='register',
            ip_address=get_client_ip(),
            details=f'New user registration (activation: {activation_mode})',
            timestamp=datetime.utcnow()
        )
        db.session.add(log)
        db.session.commit()
        
        logger.info(f"New user registered: {new_user.username} (mode: {activation_mode})")
        
        # Show appropriate message based on activation mode
        if activation_mode == 'none':
            flash('Registration successful! You can now log in.', 'success')
        elif activation_mode == 'email_verification':
            flash('Registration successful! Please check your email to verify your account.', 'success')
        elif activation_mode == 'both':
            flash('Registration successful! Please verify your email. An admin will also need to approve your account.', 'success')
        else:
            flash('Registration successful! Please wait for admin approval.', 'success')
        
        return redirect('/login')
    except Exception as e:
        db.session.rollback()
        logger.error(f"Registration error: {str(e)}")
        flash(f'An error occurred during registration: {str(e)}', 'danger')
        return redirect('/register')

@auth_bp.route('/logout')
@login_required
def logout():
    # Log activity before logging out
    user_id = current_user.id
    username = current_user.username
    log = ActivityLog(
        user_id=user_id,
        action='logout',
        ip_address=get_client_ip(),
        details='User logged out',
        timestamp=datetime.utcnow()
    )
    db.session.add(log)
    db.session.commit()
    
    logout_user()
    logger.info(f"User {username} logged out")
    flash('You have been logged out.', 'info')
    return redirect(url_for('auth.login'))

@auth_bp.route('/profile', methods=['GET', 'POST'])
@login_required
def profile():
    if request.method == 'POST':
        if 'current_password' in request.form and request.form.get('new_password'):
            current_password = request.form.get('current_password')
            new_password = request.form.get('new_password')
            confirm_password = request.form.get('confirm_password')
            
            pw_ok, pw_msg = validate_password_strength(new_password)
            if not current_user.check_password(current_password):
                flash('Current password is incorrect', 'danger')
            elif new_password != confirm_password:
                flash('New passwords do not match', 'danger')
            elif not pw_ok:
                flash(pw_msg, 'danger')
            else:
                current_user.set_password(new_password)
                
                # Log password change
                log = ActivityLog(
                    user_id=current_user.id,
                    action='password_change',
                    ip_address=get_client_ip(),
                    details='User changed password',
                    timestamp=datetime.utcnow()
                )
                db.session.add(log)
                db.session.commit()
                logger.info(f"User {current_user.username} changed password")
                flash('Password updated successfully', 'success')
        
        # Update username if it was changed
        if 'username' in request.form and request.form.get('username') != current_user.username:
            new_username = request.form.get('username')
            if User.query.filter(User.username == new_username, User.id != current_user.id).first():
                flash('Username already taken', 'danger')
            else:
                old_username = current_user.username
                current_user.username = new_username
                
                # Log username change
                log = ActivityLog(
                    user_id=current_user.id,
                    action='username_change',
                    ip_address=get_client_ip(),
                    details=f'Username changed from {old_username} to {new_username}',
                    timestamp=datetime.utcnow()
                )
                db.session.add(log)
                db.session.commit()
                logger.info(f"Username changed: {old_username} -> {new_username}")
                flash('Username updated successfully', 'success')
    
    return render_template('auth/profile.html', user=current_user)

@auth_bp.route('/register_post', methods=['POST'])
def register_post():
    """Handler for register form submission"""
    return register()




@auth_bp.route('/forgot_password', methods=['GET', 'POST'])
@rate_limit(max_requests=5, window_seconds=300)
def forgot_password():
    if request.method == 'POST':
        email = request.form.get('email')
        user = User.query.filter_by(email=email).first()

        if user:
            from app.utils.email_utils import send_password_reset_email
            send_password_reset_email(user)
            flash('If the email exists, a reset link was sent.', 'info')
        else:
            flash('If the email exists, a reset link was sent.', 'info')

        return redirect(url_for('auth.login'))

    return render_template('auth/forgot_password.html')



@auth_bp.route('/verify_email/<token>')
def verify_email(token):
    """Confirm a user's email address from the verification link."""
    from app.utils.email_utils import confirm_verification_token
    email = confirm_verification_token(token)

    if not email:
        flash('Verification link is invalid or has expired.', 'danger')
        return redirect('/login')

    user = User.query.filter_by(email=email).first()
    if not user:
        flash('Invalid user.', 'danger')
        return redirect('/login')

    if not user.is_verified:
        user.is_verified = True
        user.confirmation_token = None
        db.session.commit()
        logger.info(f"Email verified for user {user.username}")

    flash('Your email has been verified. You can now log in.', 'success')
    return redirect('/login')


@auth_bp.route('/reset_password/<token>', methods=['GET', 'POST'])
def reset_password(token):
    from app.utils.email_utils import confirm_verification_token
    email = confirm_verification_token(token)

    if not email:
        flash('Reset link is invalid or has expired.', 'danger')
        return redirect(url_for('auth.login'))

    user = User.query.filter_by(email=email).first()
    if not user:
        flash('Invalid user.', 'danger')
        return redirect(url_for('auth.login'))

    if request.method == 'POST':
        password = request.form.get('password')
        confirm = request.form.get('confirm_password')
        pw_ok, pw_msg = validate_password_strength(password)
        if password != confirm:
            flash('Passwords do not match.', 'danger')
        elif not pw_ok:
            flash(pw_msg, 'danger')
        else:
            user.set_password(password)
            from app import db
            db.session.commit()
            flash('Password has been reset.', 'success')
            return redirect(url_for('auth.login'))

    return render_template('auth/reset_password.html', token=token)


# API Endpoints for React
@auth_bp.route('/api/csrf-token')
def api_csrf_token():
    """Return CSRF token for React frontend"""
    from flask_wtf.csrf import generate_csrf
    from flask import session, make_response
    
    # Generate CSRF token (this also stores it in session)
    token = generate_csrf()
    
    # Ensure session is marked as modified so cookie is sent
    session.modified = True
    
    # Create response with proper headers for cross-origin
    response = make_response(jsonify({'csrf_token': token}))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    
    logger.info(f"CSRF token generated for {get_client_ip()}")
    
    return response

@auth_bp.route('/api/me')
def api_me():
    """Return current user info for React frontend"""
    if current_user.is_authenticated:
        return jsonify({
            'authenticated': True,
            'user': {
                'id': current_user.id,
                'username': current_user.username,
                'email': current_user.email,
                'is_admin': current_user.is_admin
            }
        })
    return jsonify({'authenticated': False, 'user': None}), 401


@auth_bp.route('/api/profile')
@login_required
def api_profile():
    """Return detailed profile info for React frontend"""
    return jsonify({
        'id': current_user.id,
        'username': current_user.username,
        'email': current_user.email,
        'is_admin': current_user.is_admin,
        'is_approved': current_user.is_approved,
        'created_at': current_user.created_at.isoformat() if current_user.created_at else None,
        'last_login': current_user.last_login.isoformat() if current_user.last_login else None,
        'storage_used': current_user.get_storage_usage(),
        'storage_limit': current_user.storage_limit,
        'storage_tier': current_user.storage_tier
    })


@auth_bp.route('/api/change-password', methods=['POST'])
@login_required
def api_change_password():
    """Handle password change from React frontend"""
    data = request.get_json()
    
    if not data:
        return jsonify({'error': 'No data provided'}), 400
    
    current_password = data.get('current_password')
    new_password = data.get('new_password')
    
    if not current_password or not new_password:
        return jsonify({'error': 'Current and new password are required'}), 400
    
    if not current_user.check_password(current_password):
        return jsonify({'error': 'Current password is incorrect'}), 400
    
    pw_ok, pw_msg = validate_password_strength(new_password)
    if not pw_ok:
        return jsonify({'error': pw_msg}), 400
    
    current_user.set_password(new_password)
    db.session.commit()
    
    # Log the activity
    log = ActivityLog(
        user_id=current_user.id,
        action='password_change',
        ip_address=get_client_ip(),
        details='Password changed via profile',
        timestamp=datetime.utcnow()
    )
    db.session.add(log)
    db.session.commit()
    
    return jsonify({'success': True, 'message': 'Password changed successfully'})
