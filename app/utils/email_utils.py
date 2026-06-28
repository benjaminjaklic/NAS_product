from flask import current_app, render_template, url_for
from flask_mail import Message, Mail
from itsdangerous import URLSafeTimedSerializer
from datetime import datetime
import logging

# Initialize Mail
mail = Mail()

def init_mail(app):
    """Initialize Mail with the Flask app
    This uses config values already defined in config.py"""
    mail.init_app(app)
    logging.info(f"Mail configuration initialized with server {app.config['MAIL_SERVER']}")

def generate_verification_token(email):
    """Generate a token for email verification"""
    serializer = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])
    return serializer.dumps(email, salt=current_app.config['SECURITY_PASSWORD_SALT'])

def confirm_verification_token(token, expiration=3600):
    """Confirm a verification token"""
    serializer = URLSafeTimedSerializer(current_app.config['SECRET_KEY'])
    try:
        email = serializer.loads(
            token,
            salt=current_app.config['SECURITY_PASSWORD_SALT'],
            max_age=expiration
        )
        return email
    except Exception as e:
        logging.error(f"Token verification error: {str(e)}")
        return None

def send_email(to, subject, template, **kwargs):
    """Send an email"""
    try:
        msg = Message(subject, recipients=[to])
        msg.html = render_template(template, **kwargs)
        logging.debug(f"Sending email to {to}: {subject}")
        mail.send(msg)
        logging.info(f"Email sent successfully to {to}")
        return True
    except Exception as e:
        logging.error(f"Failed to send email: {str(e)}")
        return False


def send_verification_email(user):
    """Send a verification email to the user
    
    Args:
        user: User object (not just email) to store token in database
    """
    # Generate token and store it in the user record
    token = generate_verification_token(user.email)
    user.confirmation_token = token
    user.token_created_at = datetime.utcnow()
    
    from app import db
    db.session.commit()
    
    verify_url = url_for('auth.verify_email', token=token, _external=True)
    
    return send_email(
        to=user.email,
        subject='NAS System - Please verify your email',
        template='auth/email/verify_email.html',
        user_email=user.email,
        verify_url=verify_url
    )

def send_password_reset_email(user):
    """Send a password reset email to the user"""
    logging.debug(f"Sending password reset email to: {user.email}")

    token = generate_verification_token(user.email)
    logging.debug(f"Password reset token generated for {user.email}")

    user.confirmation_token = token
    user.token_created_at = datetime.utcnow()

    from app import db
    db.session.commit()

    reset_url = url_for('auth.reset_password', token=token, _external=True)
    logging.debug(f"Password reset URL generated for {user.email}")

    return send_email(
        to=user.email,
        subject='NAS System - Password Reset Request',
        template='auth/email/reset_password.html',
        reset_url=reset_url
    )


# ---------------------------------------------------------------------------
# Notification helpers — these send plain-text emails so they work even
# without HTML templates.  They all silently return False when email is
# not configured (MAIL_USERNAME empty) to avoid crashing the caller.
# ---------------------------------------------------------------------------

def _is_email_configured():
    """Check whether outbound email is usable."""
    try:
        return bool(current_app.config.get('MAIL_USERNAME'))
    except RuntimeError:
        return False


def send_plain_email(to, subject, body):
    """Send a plain-text email (no template required)."""
    if not _is_email_configured():
        logging.debug("Email not configured — skipping send")
        return False
    try:
        msg = Message(subject, recipients=[to])
        msg.body = body
        mail.send(msg)
        logging.info(f"Plain email sent to {to}: {subject}")
        return True
    except Exception as e:
        logging.error(f"Failed to send plain email to {to}: {e}")
        return False


def send_admin_notification(subject, message):
    """Notify all admin users by email.

    Looks up admin users in the DB and sends each one a plain-text message.
    Safe to call even when email is disabled — it will simply return 0.
    """
    if not _is_email_configured():
        return 0

    from app.models import User
    admins = User.query.filter_by(is_admin=True).all()
    sent = 0
    for admin in admins:
        if admin.email and '@' in admin.email and admin.email != 'admin@localhost':
            if send_plain_email(admin.email, f"[NAS Admin] {subject}", message):
                sent += 1
    return sent


def send_login_notification(user, ip_address=None):
    """Send a login notification email to the user (if enabled in settings)."""
    if not _is_email_configured():
        return False

    try:
        from app.models import SystemConfig
        if not SystemConfig.get('email_login_notifications', False):
            return False
    except Exception:
        return False

    body = (
        f"Hello {user.username},\n\n"
        f"A new login to your NAS account was detected.\n\n"
        f"Time: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC\n"
        f"IP Address: {ip_address or 'unknown'}\n\n"
        f"If this was not you, please change your password immediately."
    )
    return send_plain_email(user.email, "NAS System - New Login Detected", body)


def send_quota_notification(user, usage_percent):
    """Notify a user when their storage usage crosses a threshold."""
    if not _is_email_configured():
        return False

    body = (
        f"Hello {user.username},\n\n"
        f"Your NAS storage usage has reached {usage_percent:.0f}%.\n\n"
        f"Please consider deleting old files or requesting additional storage "
        f"from your administrator.\n"
    )
    return send_plain_email(
        user.email,
        f"NAS System - Storage Usage at {usage_percent:.0f}%",
        body,
    )


def send_approval_notification(user, approved=True):
    """Let a user know their account has been approved (or rejected)."""
    if not _is_email_configured():
        return False

    if approved:
        body = (
            f"Hello {user.username},\n\n"
            f"Your NAS account has been approved! You can now log in.\n"
        )
        subject = "NAS System - Account Approved"
    else:
        body = (
            f"Hello {user.username},\n\n"
            f"Unfortunately your NAS account registration was not approved.\n"
            f"Please contact the administrator for more information.\n"
        )
        subject = "NAS System - Account Not Approved"

    return send_plain_email(user.email, subject, body)


def send_storage_request_notification(user, approved=True, new_limit_bytes=None):
    """Notify a user about the outcome of their storage request."""
    if not _is_email_configured():
        return False

    if approved:
        limit_str = ""
        if new_limit_bytes:
            limit_gb = new_limit_bytes / (1024 ** 3)
            limit_str = f" Your new limit is {limit_gb:.1f} GB."
        body = (
            f"Hello {user.username},\n\n"
            f"Your storage upgrade request has been approved!{limit_str}\n"
        )
        subject = "NAS System - Storage Request Approved"
    else:
        body = (
            f"Hello {user.username},\n\n"
            f"Your storage upgrade request has been denied.\n"
            f"Please contact your administrator for details.\n"
        )
        subject = "NAS System - Storage Request Denied"

    return send_plain_email(user.email, subject, body)


def send_test_email(recipient):
    """Send a test email to verify SMTP configuration."""
    return send_plain_email(
        recipient,
        "NAS System - Test Email",
        "This is a test email from your NAS System.\n\n"
        "If you received this, your email configuration is working correctly!"
    )
