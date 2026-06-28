"""Public share routes - no authentication required"""
from flask import Blueprint, render_template, request, jsonify, send_file, abort, url_for
from app.models import db, ShareLink, File, ActivityLog, User
from app.utils.security_utils import validate_file_path
from app.utils.speed_limiter import get_user_speed_limits, make_throttled_download_response, make_throttled_inline_response
from datetime import datetime
import os
import mimetypes

share_bp = Blueprint('share', __name__, url_prefix='/s')

PREVIEW_TYPES = {
    'image': ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'],
    'pdf': ['pdf'],
    'text': ['txt', 'md', 'json', 'log', 'csv', 'xml', 'html', 'css', 'js', 'py', 'yml', 'yaml'],
    'video': ['mp4', 'webm', 'ogg'],
    'audio': ['mp3', 'wav', 'ogg', 'flac']
}

FILE_ICONS = {
    'image': 'fa-file-image',
    'pdf': 'fa-file-pdf',
    'text': 'fa-file-alt',
    'video': 'fa-file-video',
    'audio': 'fa-file-audio',
    'document': 'fa-file-word',
    'archive': 'fa-file-archive',
}

def get_preview_type(filename):
    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    for ptype, extensions in PREVIEW_TYPES.items():
        if ext in extensions:
            return ptype
    return None

def get_file_icon(filename):
    preview_type = get_preview_type(filename)
    if preview_type:
        return FILE_ICONS.get(preview_type, 'fa-file')
    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    if ext in ['zip', 'rar', '7z', 'tar', 'gz']:
        return 'fa-file-archive'
    if ext in ['doc', 'docx']:
        return 'fa-file-word'
    if ext in ['xls', 'xlsx']:
        return 'fa-file-excel'
    if ext in ['ppt', 'pptx']:
        return 'fa-file-powerpoint'
    return 'fa-file'

def format_file_size(bytes):
    if not bytes or bytes == 0:
        return '0 B'
    k = 1024
    sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    i = 0
    while bytes >= k and i < len(sizes) - 1:
        bytes /= k
        i += 1
    return f'{bytes:.2f} {sizes[i]}'


@share_bp.route('/<token>', methods=['GET', 'POST'])
def view_shared(token):
    """View shared file - public access with nice HTML page"""
    link = ShareLink.query.filter_by(token=token).first_or_404()
    
    file = link.file
    filename = file.original_filename or file.filename if file else 'Unknown'
    file_size = file.file_size if file else 0
    
    # Check if link is valid
    if not link.is_valid():
        return render_template('share/view.html',
            expired=True,
            filename=filename,
            file_size_formatted=format_file_size(file_size)
        )
    
    if not file:
        return render_template('share/view.html',
            expired=True,
            filename='File not found',
            file_size_formatted='0 B'
        )
    
    # Handle password protection
    error = None
    verified = False
    if link.password_hash:
        if request.method == 'POST':
            password = request.form.get('password', '')
            if link.check_password(password):
                verified = True
            else:
                error = 'Incorrect password'
        
        if not verified:
            return render_template('share/view.html',
                expired=False,
                requires_password=True,
                verified=False,
                filename=filename,
                file_size_formatted=format_file_size(file_size),
                error=error
            )
    
    # Update access stats
    link.access_count += 1
    link.last_accessed = datetime.utcnow()
    db.session.commit()
    
    preview_type = get_preview_type(filename)

    # Only inline-render media types we control. The actual markup is built in
    # the Jinja template with auto-escaping so the (user-controlled) filename
    # can never break out of an attribute and inject script (XSS).
    inline_preview_type = None
    if preview_type in ('image', 'video', 'audio') and link.allow_preview:
        inline_preview_type = preview_type

    return render_template('share/view.html',
        expired=False,
        requires_password=False,
        verified=True,
        filename=filename,
        file_size_formatted=format_file_size(file_size),
        file_type=file.file_type or 'Unknown',
        file_icon=get_file_icon(filename),
        preview_type=preview_type,
        inline_preview_type=inline_preview_type,
        can_preview=preview_type is not None and link.allow_preview,
        can_download=link.allow_download,
        one_time=link.one_time_download,
        download_url=url_for('share.download_shared', token=token),
        preview_url=url_for('share.preview_shared', token=token)
    )


@share_bp.route('/<token>/verify', methods=['POST'])
def verify_password(token):
    """Verify password for protected share"""
    link = ShareLink.query.filter_by(token=token).first_or_404()
    
    if not link.is_valid():
        return jsonify({'error': 'This link has expired or been revoked'}), 410
    
    data = request.get_json() or {}
    password = data.get('password', '')
    
    if not link.check_password(password):
        return jsonify({'error': 'Incorrect password'}), 401
    
    # Update access stats
    link.access_count += 1
    link.last_accessed = datetime.utcnow()
    db.session.commit()
    
    file = link.file
    preview_type = get_preview_type(file.original_filename or file.filename)
    
    return jsonify({
        'filename': file.original_filename or file.filename,
        'file_size': file.file_size,
        'file_type': file.file_type,
        'preview_type': preview_type,
        'can_preview': preview_type is not None and link.allow_preview,
        'can_download': link.allow_download,
        'verified': True
    })


@share_bp.route('/<token>/preview')
def preview_shared(token):
    """Preview shared file content"""
    link = ShareLink.query.filter_by(token=token).first_or_404()
    
    if not link.is_valid():
        return jsonify({'error': 'Link expired or revoked'}), 410
    
    if not link.allow_preview:
        return jsonify({'error': 'Preview not allowed for this link'}), 403
    
    # Check password via header if required
    if link.password_hash:
        password = request.headers.get('X-Share-Password', '')
        if not link.check_password(password):
            return jsonify({'error': 'Password required'}), 401
    
    file = link.file
    if not file or not validate_file_path(file.path) or not os.path.exists(file.path):
        return jsonify({'error': 'File not found'}), 404
    
    preview_type = get_preview_type(file.original_filename or file.filename)
    
    if preview_type == 'text':
        try:
            file_size = os.path.getsize(file.path)
            if file_size > 1024 * 1024:
                return jsonify({'error': 'File too large for preview'}), 413
            with open(file.path, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
            return jsonify({'content': content, 'type': 'text'})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    mimetype = mimetypes.guess_type(file.original_filename or file.filename)[0] or 'application/octet-stream'
    # Apply download speed limit based on file owner's role
    file_owner = User.query.get(file.user_id)
    _, download_limit = get_user_speed_limits(file_owner) if file_owner else (0, 0)
    return make_throttled_inline_response(file.path, mimetype=mimetype, speed_limit=download_limit)


@share_bp.route('/<token>/download')
def download_shared(token):
    """Download shared file"""
    link = ShareLink.query.filter_by(token=token).first_or_404()
    
    if not link.is_valid():
        return render_template('share/view.html',
            expired=True,
            filename='Link expired',
            file_size_formatted='0 B'
        )
    
    if not link.allow_download:
        return jsonify({'error': 'Download not allowed for this link'}), 403
    
    # Check one-time download limit
    if link.one_time_download and link.download_count >= 1:
        return render_template('share/view.html',
            expired=True,
            filename='Download limit reached',
            file_size_formatted='0 B'
        )
    
    # Check max downloads limit
    if link.max_downloads and link.download_count >= link.max_downloads:
        return render_template('share/view.html',
            expired=True,
            filename='Download limit reached',
            file_size_formatted='0 B'
        )
    
    file = link.file
    if not file or not validate_file_path(file.path) or not os.path.exists(file.path):
        return jsonify({'error': 'File not found'}), 404
    
    # Update download count
    link.download_count = (link.download_count or 0) + 1
    link.last_accessed = datetime.utcnow()
    
    # Auto-revoke one-time links after download
    if link.one_time_download:
        link.is_revoked = True
    
    db.session.commit()
    
    # Apply download speed limit based on file owner's role
    file_owner = User.query.get(file.user_id)
    _, download_limit = get_user_speed_limits(file_owner) if file_owner else (0, 0)
    
    return make_throttled_download_response(
        file.path,
        download_name=file.original_filename or file.filename,
        speed_limit=download_limit
    )
