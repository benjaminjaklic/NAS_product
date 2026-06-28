from functools import wraps
from flask import current_app, request, abort, flash, redirect, url_for
from flask_login import current_user
import jwt
from datetime import datetime, timedelta
import hashlib
import re
import os
from typing import List, Optional, Tuple
import logging

logger = logging.getLogger(__name__)

# Reasonable email pattern for registration validation (not RFC-perfect, but
# rejects obviously invalid input).
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# bcrypt only hashes the first 72 bytes of a password; reject anything longer
# so users are not silently given weaker-than-expected protection.
MAX_PASSWORD_BYTES = 72


def is_valid_email(email: str) -> bool:
    """Lightweight email format validation."""
    if not email or len(email) > 254:
        return False
    return bool(_EMAIL_RE.match(email))


def validate_password_strength(password: str) -> Tuple[bool, str]:
    """Validate password strength and return (ok, message).

    Policy: at least 8 characters, contains a letter and a number, and is no
    longer than bcrypt's 72-byte limit.
    """
    if not password:
        return False, "Password is required."
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
    if len(password.encode('utf-8')) > MAX_PASSWORD_BYTES:
        return False, "Password is too long (max 72 bytes)."
    if not re.search(r"[A-Za-z]", password):
        return False, "Password must contain at least one letter."
    if not re.search(r"\d", password):
        return False, "Password must contain at least one number."
    return True, ""

def validate_file_path(file_path: str, base_dir: str = None) -> bool:
    """
    Validate that a file path is safe and within the allowed base directory.
    Prevents path traversal attacks.
    
    Args:
        file_path: The file path to validate
        base_dir: The base directory files must be within (defaults to UPLOAD_FOLDER)
    
    Returns:
        bool: True if path is safe, False otherwise
    """
    if base_dir is None:
        base_dir = current_app.config.get('UPLOAD_FOLDER', '')
    
    if not file_path or not base_dir:
        return False
    
    # Normalize both paths to absolute paths
    try:
        real_base = os.path.realpath(base_dir)
        real_path = os.path.realpath(file_path)
        
        # Check if the file path starts with the base directory
        # This prevents path traversal attacks like ../../../etc/passwd
        return real_path.startswith(real_base + os.sep) or real_path == real_base
    except (OSError, ValueError):
        return False


def get_safe_file_path(user_id: int, filename: str) -> str:
    """
    Generate a safe file path for a user's file.
    
    Args:
        user_id: The user's ID
        filename: The filename (will be sanitized)
    
    Returns:
        str: Safe absolute file path
    """
    from werkzeug.utils import secure_filename
    
    safe_filename = secure_filename(filename)
    if not safe_filename:
        raise ValueError("Invalid filename")
    
    user_dir = os.path.join(
        current_app.config['UPLOAD_FOLDER'],
        'users',
        str(user_id)
    )
    
    return os.path.join(user_dir, safe_filename)


def admin_required(f):
    """Decorator to check if current user is admin"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or not current_user.is_admin:
            flash('Admin access required.', 'error')
            return redirect(url_for('auth.login'))
        return f(*args, **kwargs)
    return decorated_function


def has_file_access(file_obj):
    """Validate file access permissions"""
    if not current_user.is_authenticated:
        return False
    
    # Admin has access to all files
    if current_user.is_admin:
        return True
    
    # File owner has access
    if file_obj.user_id == current_user.id:
        return True
    
    # Check group access
    if file_obj.group_id:
        from app.models import UserGroups
        membership = UserGroups.query.filter_by(
            user_id=current_user.id, group_id=file_obj.group_id
        ).first()
        if membership:
            return True
    
    # Check shared file access
    if file_obj.is_public:
        return True
    
    return False


class SecurityUtils:
    @staticmethod
    def validate_password(password: str) -> bool:
        """
        Validate password strength
        - At least 8 characters
        - Contains uppercase and lowercase letters
        - Contains numbers
        - Contains special characters
        """
        if len(password) < 8:
            return False
        if not re.search(r"[A-Z]", password):
            return False
        if not re.search(r"[a-z]", password):
            return False
        if not re.search(r"\d", password):
            return False
        if not re.search(r"[ !@#$%&'()*+,-./[\\\]^_`{|}~"+r'"]', password):
            return False
        return True

    @staticmethod
    def generate_file_token(file_id: int, user_id: int, expiry_minutes: int = 30) -> str:
        """Generate temporary token for file access"""
        payload = {
            'file_id': file_id,
            'user_id': user_id,
            'exp': datetime.utcnow() + timedelta(minutes=expiry_minutes)
        }
        return jwt.encode(payload, current_app.config['SECRET_KEY'], algorithm='HS256')

    @staticmethod
    def verify_file_token(token: str) -> Optional[dict]:
        """Verify file access token"""
        try:
            return jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=['HS256'])
        except jwt.ExpiredSignatureError:
            logger.warning(f"Expired file access token used: {token}")
            return None
        except jwt.InvalidTokenError:
            logger.warning(f"Invalid file access token used: {token}")
            return None

    @staticmethod
    def hash_file(file_path: str) -> str:
        """Generate SHA-256 hash of file"""
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()


class RateLimiter:
    def __init__(self, max_requests: int = 100, window_minutes: int = 1):
        self.max_requests = max_requests
        self.window_minutes = window_minutes
        self.requests = {}

    def is_allowed(self, ip: str) -> bool:
        now = datetime.utcnow()
        window_start = now - timedelta(minutes=self.window_minutes)
        
        # Clean old requests
        self.requests = {k: v for k, v in self.requests.items() 
                        if v[-1] > window_start}
        
        if ip not in self.requests:
            self.requests[ip] = []
        
        # Count requests in current window
        recent_requests = [t for t in self.requests[ip] if t > window_start]
        
        if len(recent_requests) >= self.max_requests:
            return False
        
        self.requests[ip] = recent_requests + [now]
        return True


rate_limiter = RateLimiter()


def rate_limit(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not rate_limiter.is_allowed(request.remote_addr):
            logger.warning(f"Rate limit exceeded for IP: {request.remote_addr}")
            abort(429)
        return f(*args, **kwargs)
    return decorated_function


class IPBlocker:
    def __init__(self):
        self.blocked_ips: List[Tuple[str, datetime]] = []  # List of (ip, blocked_time) tuples
        self.failed_attempts = {}
        self.max_failures = 5
        self.block_duration = timedelta(minutes=30)

    def check_ip(self, ip: str) -> bool:
        """Check if IP is allowed"""
        now = datetime.utcnow()
        
        # Clean expired blocks
        self.blocked_ips = [(blocked_ip, blocked_time) for blocked_ip, blocked_time in self.blocked_ips
                           if blocked_time + self.block_duration > now]
        
        # Check if IP is blocked
        if ip in [blocked_ip for blocked_ip, _ in self.blocked_ips]:
            return False
        
        return True

    def record_failure(self, ip: str):
        """Record failed attempt"""
        now = datetime.utcnow()
        if ip not in self.failed_attempts:
            self.failed_attempts[ip] = []
        
        self.failed_attempts[ip].append(now)
        
        # Check if IP should be blocked
        recent_failures = [t for t in self.failed_attempts[ip] 
                         if t > now - timedelta(minutes=30)]
        if len(recent_failures) >= self.max_failures:
            self.blocked_ips.append((ip, now))
            logger.warning(f"IP blocked due to multiple failures: {ip}")


ip_blocker = IPBlocker()


def check_ip_block(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not ip_blocker.check_ip(request.remote_addr):
            logger.warning(f"Blocked IP attempted access: {request.remote_addr}")
            abort(403)
        return f(*args, **kwargs)
    return decorated_function


def get_client_ip():
    """Get the real IP address of the client, even when behind a proxy."""
    if request.headers.get('X-Forwarded-For'):
        # If behind a proxy, get real IP
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    return request.remote_addr


def require_file_access(f):
    """
    Decorator to check file access permissions.
    Expects file_id as a route parameter.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        from app.models import File
        
        file_id = kwargs.get('file_id')
        if not file_id:
            abort(400, description="File ID required")
        
        file_obj = File.query.get(file_id)
        if not file_obj:
            abort(404, description="File not found")
        
        if not has_file_access(file_obj):
            logger.warning(
                f"Unauthorized file access attempt: user={current_user.id if current_user.is_authenticated else 'anonymous'}, "
                f"file={file_id}, ip={get_client_ip()}"
            )
            abort(403, description="Access denied")
        
        # Validate file path before allowing access
        if not validate_file_path(file_obj.path):
            logger.error(
                f"Invalid file path detected: file={file_id}, path={file_obj.path}"
            )
            abort(404, description="File not found")
        
        return f(*args, **kwargs)
    return decorated_function