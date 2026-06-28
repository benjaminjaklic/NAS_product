from flask import Blueprint, render_template, redirect, url_for, flash, request, jsonify, current_app
from flask_login import login_required, current_user
from app.models import db, User, ActivityLog, StorageRequest, File, Role, Notification, Tag, UserGroups, UserTheme, Note, TrashedFile, ShareLink, FileVersion
from app.utils.security_utils import get_client_ip
from app.version import get_current_version, check_for_update
from datetime import datetime
from functools import wraps
import os
import shutil
import logging

logger = logging.getLogger(__name__)

admin_bp = Blueprint('admin', __name__, url_prefix='/admin')

def admin_required(f):
    @wraps(f)
    @login_required
    def decorated_function(*args, **kwargs):
        if not current_user.is_admin:
            flash('You need administrative privileges to access this page.', 'error')
            return redirect(url_for('files.dashboard'))
        return f(*args, **kwargs)
    return decorated_function

def get_user_role_name(user):
    """Get the actual role name for a user"""
    # Check role_obj first (new system)
    if user.role_obj:
        return user.role_obj.name
    # Check is_demo flag
    if user.is_demo:
        return 'demo'
    # Check is_admin flag
    if user.is_admin:
        return 'admin'
    # Fall back to role field or default
    return user.role or 'user'

@admin_bp.route('/api/users')
@admin_required
def api_users():
    """API endpoint for React admin panel"""
    users = User.query.all()
    roles = Role.query.all()
    users_data = []
    for user in users:
        file_count = File.query.filter_by(user_id=user.id).count()
        role_name = get_user_role_name(user)
        role_obj = user.role_obj or Role.query.filter_by(name=role_name).first()
        users_data.append({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'is_admin': user.is_admin,
            'is_approved': user.is_approved,
            'role': role_name,
            'role_id': user.role_id,
            'role_color': role_obj.color if role_obj else '#6c757d',
            'storage_used': user.storage_used or 0,
            'storage_limit': user.storage_limit,
            'file_count': file_count,
            'created_at': user.created_at.isoformat() if user.created_at else None
        })
    return jsonify({
        'users': users_data, 
        'available_roles': [r.to_dict() for r in roles]
    })


@admin_bp.route('/api/version')
@admin_required
def api_version():
    """Return current version and optionally check GitHub for updates."""
    github_repo = current_app.config.get('GITHUB_REPO', '')
    update_info = check_for_update(github_repo)
    return jsonify(update_info)


@admin_bp.route('/api/user/<int:user_id>/role', methods=['POST'])
@admin_required
def update_user_role(user_id):
    """Update a user's role"""
    user = User.query.get_or_404(user_id)
    data = request.get_json()
    new_role_name = data.get('role', 'user')
    
    # Find the role in database
    new_role = Role.query.filter_by(name=new_role_name).first()
    if not new_role:
        return jsonify({'error': f'Role not found: {new_role_name}'}), 400
    
    # Prevent demoting the main admin
    if user.username == 'admin' and new_role_name != 'admin':
        return jsonify({'error': 'Cannot change role of main admin account'}), 400
    
    old_role_name = get_user_role_name(user)
    
    # Update user role
    user.role = new_role_name
    user.role_id = new_role.id
    user.is_admin = new_role.is_admin
    user.is_demo = (new_role_name == 'demo')
    
    # Update storage limit based on role quota
    user.storage_limit = new_role.storage_quota
    
    # Log the change
    log = ActivityLog(
        user_id=current_user.id,
        action='role_change',
        details=f'Changed {user.username} role from {old_role_name} to {new_role_name}',
        ip_address=get_client_ip(),
        timestamp=datetime.utcnow()
    )
    db.session.add(log)
    db.session.commit()
    
    return jsonify({'success': True, 'message': f'Role updated to {new_role_name}'})

@admin_bp.route('/api/roles')
@admin_required
def api_roles():
    """Get all roles"""
    roles = Role.query.all()
    return jsonify({'roles': [r.to_dict() for r in roles]})

@admin_bp.route('/api/roles', methods=['POST'])
@admin_required
def create_role():
    """Create a new custom role"""
    data = request.get_json()
    
    name = data.get('name', '').strip().lower()
    display_name = data.get('display_name', '').strip()
    storage_quota = data.get('storage_quota', 10 * 1024 * 1024 * 1024)  # 10GB default
    color = data.get('color', '#6c757d')
    description = data.get('description', '')
    is_admin = data.get('is_admin', False)
    upload_speed_limit = data.get('upload_speed_limit', 0)
    download_speed_limit = data.get('download_speed_limit', 0)
    
    if not name:
        return jsonify({'error': 'Role name is required'}), 400
    
    # Check for existing role
    if Role.query.filter_by(name=name).first():
        return jsonify({'error': 'Role already exists'}), 400
    
    # Sanitize name (alphanumeric and underscore only)
    import re
    if not re.match(r'^[a-z0-9_]+$', name):
        return jsonify({'error': 'Role name must contain only lowercase letters, numbers, and underscores'}), 400
    
    role = Role(
        name=name,
        display_name=display_name or name.title(),
        storage_quota=int(storage_quota),
        color=color,
        description=description,
        is_admin=bool(is_admin),
        is_system=False,
        upload_speed_limit=int(upload_speed_limit),
        download_speed_limit=int(download_speed_limit)
    )
    db.session.add(role)
    
    # Log
    log = ActivityLog(
        user_id=current_user.id,
        action='role_create',
        details=f'Created role: {name}',
        ip_address=get_client_ip(),
        timestamp=datetime.utcnow()
    )
    db.session.add(log)
    db.session.commit()
    
    return jsonify({'success': True, 'role': role.to_dict()})

@admin_bp.route('/api/roles/<int:role_id>', methods=['PUT'])
@admin_required
def update_role(role_id):
    """Update an existing role"""
    role = Role.query.get_or_404(role_id)
    data = request.get_json()
    
    # System roles can only have quota and speed limits updated
    if role.is_system:
        if 'storage_quota' in data:
            role.storage_quota = int(data['storage_quota'])
        if 'description' in data:
            role.description = data['description']
        if 'upload_speed_limit' in data:
            role.upload_speed_limit = int(data['upload_speed_limit'])
        if 'download_speed_limit' in data:
            role.download_speed_limit = int(data['download_speed_limit'])
    else:
        # Custom roles can be fully edited
        if 'display_name' in data:
            role.display_name = data['display_name']
        if 'storage_quota' in data:
            role.storage_quota = int(data['storage_quota'])
        if 'color' in data:
            role.color = data['color']
        if 'description' in data:
            role.description = data['description']
        if 'is_admin' in data:
            role.is_admin = bool(data['is_admin'])
        if 'upload_speed_limit' in data:
            role.upload_speed_limit = int(data['upload_speed_limit'])
        if 'download_speed_limit' in data:
            role.download_speed_limit = int(data['download_speed_limit'])
    
    # Propagate storage quota changes to all users with this role
    affected_users = User.query.filter_by(role_id=role.id).all()
    for user in affected_users:
        user.storage_limit = role.storage_quota
    
    # Log
    log = ActivityLog(
        user_id=current_user.id,
        action='role_update',
        details=f'Updated role: {role.name} (propagated to {len(affected_users)} users)',
        ip_address=get_client_ip(),
        timestamp=datetime.utcnow()
    )
    db.session.add(log)
    db.session.commit()
    
    return jsonify({'success': True, 'role': role.to_dict(), 'affected_users': len(affected_users)})

@admin_bp.route('/api/roles/<int:role_id>', methods=['DELETE'])
@admin_required
def delete_role(role_id):
    """Delete a custom role"""
    role = Role.query.get_or_404(role_id)
    
    if role.is_system:
        return jsonify({'error': 'Cannot delete system roles'}), 400
    
    # Check if any users have this role
    if role.users.count() > 0:
        return jsonify({'error': f'Cannot delete role with {role.users.count()} assigned users. Reassign them first.'}), 400
    
    role_name = role.name
    db.session.delete(role)
    
    # Log
    log = ActivityLog(
        user_id=current_user.id,
        action='role_delete',
        details=f'Deleted role: {role_name}',
        ip_address=get_client_ip(),
        timestamp=datetime.utcnow()
    )
    db.session.add(log)
    db.session.commit()
    
    return jsonify({'success': True, 'message': f'Role {role_name} deleted'})

@admin_bp.route('/api/stats')
@admin_required
def api_stats():
    """API endpoint for admin dashboard stats"""
    total_users = User.query.count()
    pending_approvals = User.query.filter_by(is_approved=False).count()
    
    # Calculate total storage and files
    total_storage = db.session.query(db.func.sum(User.storage_used)).scalar() or 0
    total_files = File.query.count()
    
    # Get recent activity
    recent_activities = ActivityLog.query.order_by(ActivityLog.timestamp.desc()).limit(20).all()
    activity_data = []
    for activity in recent_activities:
        user = User.query.get(activity.user_id)
        activity_data.append({
            'username': user.username if user else 'Unknown',
            'action': activity.action.replace('_', ' ').title(),
            'details': activity.details,
            'timestamp': activity.timestamp.isoformat() if activity.timestamp else None
        })
    
    return jsonify({
        'totalUsers': total_users,
        'pendingApprovals': pending_approvals,
        'totalStorage': total_storage,
        'totalFiles': total_files,
        'recentActivity': activity_data
    })

@admin_bp.route('/api/logs')
@admin_required
def api_logs():
    """API endpoint for activity logs with filtering"""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    user_id = request.args.get('user_id', type=int)
    action = request.args.get('action', '')
    date_from = request.args.get('date_from', '')
    date_to = request.args.get('date_to', '')
    
    query = ActivityLog.query
    
    if user_id:
        query = query.filter(ActivityLog.user_id == user_id)
    if action:
        query = query.filter(ActivityLog.action == action)
    if date_from:
        try:
            from_date = datetime.strptime(date_from, '%Y-%m-%d')
            query = query.filter(ActivityLog.timestamp >= from_date)
        except ValueError:
            pass
    if date_to:
        try:
            to_date = datetime.strptime(date_to, '%Y-%m-%d')
            to_date = to_date.replace(hour=23, minute=59, second=59)
            query = query.filter(ActivityLog.timestamp <= to_date)
        except ValueError:
            pass
    
    total = query.count()
    total_pages = (total + per_page - 1) // per_page
    
    logs = query.order_by(ActivityLog.timestamp.desc()).offset((page - 1) * per_page).limit(per_page).all()
    
    logs_data = []
    for log in logs:
        user = User.query.get(log.user_id)
        logs_data.append({
            'id': log.id,
            'username': user.username if user else 'Unknown',
            'user_id': log.user_id,
            'action': log.action,
            'details': log.details,
            'ip_address': log.ip_address,
            'timestamp': log.timestamp.isoformat() if log.timestamp else None
        })
    
    return jsonify({
        'logs': logs_data,
        'page': page,
        'per_page': per_page,
        'total': total,
        'total_pages': total_pages
    })

@admin_bp.route('/api/logs/export')
@admin_required
def api_logs_export():
    """Export logs as CSV"""
    import csv
    import io
    
    user_id = request.args.get('user_id', type=int)
    action = request.args.get('action', '')
    date_from = request.args.get('date_from', '')
    date_to = request.args.get('date_to', '')
    
    query = ActivityLog.query
    
    if user_id:
        query = query.filter(ActivityLog.user_id == user_id)
    if action:
        query = query.filter(ActivityLog.action == action)
    if date_from:
        try:
            from_date = datetime.strptime(date_from, '%Y-%m-%d')
            query = query.filter(ActivityLog.timestamp >= from_date)
        except ValueError:
            pass
    if date_to:
        try:
            to_date = datetime.strptime(date_to, '%Y-%m-%d')
            to_date = to_date.replace(hour=23, minute=59, second=59)
            query = query.filter(ActivityLog.timestamp <= to_date)
        except ValueError:
            pass
    
    logs = query.order_by(ActivityLog.timestamp.desc()).limit(10000).all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Timestamp', 'Username', 'Action', 'Details', 'IP Address'])
    
    for log in logs:
        user = User.query.get(log.user_id)
        writer.writerow([
            log.timestamp.isoformat() if log.timestamp else '',
            user.username if user else 'Unknown',
            log.action,
            log.details or '',
            log.ip_address or ''
        ])
    
    output.seek(0)
    from flask import Response
    return Response(
        output.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=activity_logs.csv'}
    )

@admin_bp.route('/api/telemetry')
@admin_required
def api_telemetry():
    """API endpoint for telemetry data (charts)"""
    from sqlalchemy import func
    from datetime import timedelta
    
    # Get activity counts by day for the last 30 days
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    
    daily_activity = db.session.query(
        func.date(ActivityLog.timestamp).label('date'),
        func.count(ActivityLog.id).label('count')
    ).filter(
        ActivityLog.timestamp >= thirty_days_ago
    ).group_by(
        func.date(ActivityLog.timestamp)
    ).order_by(
        func.date(ActivityLog.timestamp)
    ).all()
    
    # Get activity by type
    activity_by_type = db.session.query(
        ActivityLog.action,
        func.count(ActivityLog.id).label('count')
    ).filter(
        ActivityLog.timestamp >= thirty_days_ago
    ).group_by(
        ActivityLog.action
    ).order_by(
        func.count(ActivityLog.id).desc()
    ).limit(10).all()
    
    # Get storage usage by user (top 10)
    storage_by_user = db.session.query(
        User.username,
        User.storage_used,
        User.storage_limit
    ).filter(
        User.storage_used > 0
    ).order_by(
        User.storage_used.desc()
    ).limit(10).all()
    
    # Get file uploads by day
    daily_uploads = db.session.query(
        func.date(File.uploaded_at).label('date'),
        func.count(File.id).label('count'),
        func.sum(File.file_size).label('size')
    ).filter(
        File.uploaded_at >= thirty_days_ago
    ).group_by(
        func.date(File.uploaded_at)
    ).order_by(
        func.date(File.uploaded_at)
    ).all()
    
    # Calculate total server storage
    total_storage_used = db.session.query(func.sum(User.storage_used)).scalar() or 0
    
    return jsonify({
        'dailyActivity': [{'date': str(d.date), 'count': d.count} for d in daily_activity],
        'activityByType': [{'action': a.action, 'count': a.count} for a in activity_by_type],
        'storageByUser': [{'username': s.username, 'used': s.storage_used or 0, 'limit': s.storage_limit or 0} for s in storage_by_user],
        'dailyUploads': [{'date': str(d.date), 'count': d.count, 'size': d.size or 0} for d in daily_uploads],
        'totalStorageUsed': total_storage_used
    })

# Storage tier definitions (in bytes)
STORAGE_TIERS = {
    'demo': 5 * 1024 * 1024 * 1024,      # 5GB
    'basic': 50 * 1024 * 1024 * 1024,    # 50GB
    'plus': 100 * 1024 * 1024 * 1024,    # 100GB
    'pro': 200 * 1024 * 1024 * 1024,     # 200GB
}

@admin_bp.route('/api/storage-requests')
@admin_required
def api_storage_requests():
    """Get all pending storage requests"""
    requests = StorageRequest.query.filter_by(status='pending').order_by(StorageRequest.created_at.desc()).all()
    return jsonify({
        'requests': [{
            'id': r.id,
            'user_id': r.user_id,
            'username': r.user.username if r.user else 'Unknown',
            'current_tier': r.user.storage_tier if r.user else 'basic',
            'current_limit': r.user.storage_limit if r.user else 0,
            'requested_size': r.requested_size,
            'reason': r.reason,
            'created_at': r.created_at.isoformat() if r.created_at else None
        } for r in requests]
    })

@admin_bp.route('/api/storage-requests/<int:request_id>/approve', methods=['POST'])
@admin_required
def api_approve_storage_request(request_id):
    """Approve a storage request"""
    storage_request = StorageRequest.query.get_or_404(request_id)
    new_tier = request.form.get('new_tier', 'basic')
    
    if new_tier not in STORAGE_TIERS:
        return jsonify({'error': 'Invalid tier'}), 400
    
    user = storage_request.user
    if user:
        # Admins can't be downgraded below plus
        if user.is_admin and STORAGE_TIERS.get(new_tier, 0) < STORAGE_TIERS['plus']:
            return jsonify({'error': 'Admins cannot be downgraded below Plus tier'}), 400
        
        user.storage_tier = new_tier
        user.storage_limit = STORAGE_TIERS[new_tier]
    
    storage_request.status = 'approved'
    storage_request.responded_at = datetime.utcnow()
    storage_request.responded_by = current_user.id
    
    db.session.commit()
    
    return jsonify({'success': True, 'message': f'Request approved. User upgraded to {new_tier} tier.'})

@admin_bp.route('/api/storage-requests/<int:request_id>/reject', methods=['POST'])
@admin_required
def api_reject_storage_request(request_id):
    """Reject a storage request"""
    storage_request = StorageRequest.query.get_or_404(request_id)
    
    storage_request.status = 'rejected'
    storage_request.responded_at = datetime.utcnow()
    storage_request.responded_by = current_user.id
    
    db.session.commit()
    
    return jsonify({'success': True, 'message': 'Request rejected.'})

@admin_bp.route('/api/user/<int:user_id>/tier', methods=['POST'])
@admin_required
def api_set_user_tier(user_id):
    """Set a user's storage tier"""
    user = User.query.get_or_404(user_id)
    new_tier = request.form.get('tier', 'basic')
    
    if new_tier not in STORAGE_TIERS:
        return jsonify({'error': 'Invalid tier'}), 400
    
    # Admins can't be downgraded below plus
    if user.is_admin and STORAGE_TIERS.get(new_tier, 0) < STORAGE_TIERS['plus']:
        return jsonify({'error': 'Admins cannot be downgraded below Plus tier'}), 400
    
    # Demo users stay on demo tier
    if user.is_demo:
        return jsonify({'error': 'Demo users cannot change tier'}), 400
    
    user.storage_tier = new_tier
    user.storage_limit = STORAGE_TIERS[new_tier]
    db.session.commit()
    
    return jsonify({'success': True, 'message': f'User tier changed to {new_tier}.'})

@admin_bp.route('/api/tiers')
@admin_required
def api_get_tiers():
    """Get available storage tiers"""
    return jsonify({
        'tiers': [
            {'name': 'demo', 'size': STORAGE_TIERS['demo'], 'label': 'Demo (5GB)'},
            {'name': 'basic', 'size': STORAGE_TIERS['basic'], 'label': 'Basic (50GB)'},
            {'name': 'plus', 'size': STORAGE_TIERS['plus'], 'label': 'Plus (100GB)'},
            {'name': 'pro', 'size': STORAGE_TIERS['pro'], 'label': 'Pro (200GB)'},
        ]
    })

@admin_bp.route('/dashboard')
@admin_required
def dashboard():
    if current_user.is_demo:
        return render_template('admin/dashboard.html',
                               total_users=1,
                               pending_users=0,
                               pending_requests=0,
                               recent_activities=[])

    total_users = User.query.count()
    pending_users = User.query.filter_by(is_approved=False).count()
    pending_requests = StorageRequest.query.filter_by(status='pending').count()
    recent_activities = ActivityLog.query.order_by(ActivityLog.timestamp.desc()).limit(10).all()

    return render_template('admin/dashboard.html',
                           total_users=total_users,
                           pending_users=pending_users,
                           pending_requests=pending_requests,
                           recent_activities=recent_activities)

@admin_bp.route('/manage_users')
@admin_required
def manage_users():
    if current_user.is_demo:
        now = datetime.utcnow()
        return render_template('admin/users.html', users=[current_user], now=now, default_admin_id=current_user.id)

    users_list = User.query.all()
    now = datetime.utcnow()
    return render_template('admin/users.html', users=users_list, now=now, default_admin_id=1)

@admin_bp.route('/approve-user', methods=['POST'])
@admin_required
def approve_user_api():
    """API endpoint for React admin panel"""
    user_id = request.form.get('user_id')
    action = request.form.get('action', 'approve')
    
    if not user_id:
        return jsonify({'error': 'User ID required'}), 400
    
    user = User.query.get_or_404(int(user_id))
    
    if action == 'reject':
        user.is_approved = False
        details = f'Rejected user: {user.username}'
        log_action = 'user_rejected'
    else:
        user.is_approved = True
        details = f'Approved user: {user.username}'
        log_action = 'user_approved'
    
    log = ActivityLog(user_id=current_user.id, action=log_action, details=details,
                      ip_address=get_client_ip(), timestamp=datetime.utcnow())
    db.session.add(log)
    db.session.commit()
    
    # Send approval/rejection email notification
    try:
        from app.utils.email_utils import send_approval_notification
        send_approval_notification(user, approved=(action != 'reject'))
    except Exception:
        pass
    
    return jsonify({'message': 'User updated successfully'})

@admin_bp.route('/user/<int:user_id>/approve', methods=['POST'])
@admin_required
def approve_user(user_id):
    if current_user.is_demo:
        flash("Demo user can't approve users.", 'warning')
        return redirect(url_for('admin.manage_users'))

    user = User.query.get_or_404(user_id)
    action = request.args.get('action', 'approve')
    if action == 'revoke':
        user.is_approved = False
        details = f'Revoked approval for user: {user.username}'
        flash_message = f'Approval for {user.username} has been revoked.'
        log_action = 'user_approval_revoked'
    else:
        if user.is_approved:
            flash('User is already approved.', 'info')
            return redirect(url_for('admin.manage_users'))
        user.is_approved = True
        details = f'Approved user: {user.username}'
        flash_message = f'User {user.username} has been approved.'
        log_action = 'user_approval'

    log = ActivityLog(user_id=current_user.id, action=log_action, details=details,
                      ip_address=get_client_ip(), timestamp=datetime.utcnow())
    db.session.add(log)
    db.session.commit()
    flash(flash_message, 'success')
    return redirect(url_for('admin.manage_users'))

@admin_bp.route('/toggle-admin', methods=['POST'])
@admin_required
def toggle_admin_api():
    """API endpoint for React admin panel"""
    user_id = request.form.get('user_id')
    is_admin = request.form.get('is_admin') == 'true'
    
    if not user_id:
        return jsonify({'error': 'User ID required'}), 400
    
    user_id = int(user_id)
    user = User.query.get_or_404(user_id)
    
    # Protect admin and demo users
    if user.username in ['admin', 'demo']:
        return jsonify({'error': 'Cannot modify protected users (admin/demo)'}), 403
    
    if user_id == current_user.id:
        return jsonify({'error': 'Cannot modify your own admin status'}), 403
    
    user.is_admin = is_admin
    
    action = 'admin_status_granted' if is_admin else 'admin_status_revoked'
    details = f'Admin status {"granted to" if is_admin else "revoked from"} user: {user.username}'
    
    log = ActivityLog(user_id=current_user.id, action=action, details=details,
                      ip_address=get_client_ip(), timestamp=datetime.utcnow())
    db.session.add(log)
    db.session.commit()
    
    return jsonify({'message': 'Admin status updated'})

@admin_bp.route('/delete-user', methods=['POST'])
@admin_required
def delete_user_api():
    """API endpoint for React admin panel"""
    user_id = request.form.get('user_id')
    
    if not user_id:
        return jsonify({'error': 'User ID required'}), 400
    
    user_id = int(user_id)
    user = User.query.get_or_404(user_id)
    
    # Protect admin and demo users
    if user.username in ['admin', 'demo']:
        return jsonify({'error': 'Cannot delete protected users (admin/demo)'}), 403
    
    if user_id == current_user.id:
        return jsonify({'error': 'Cannot delete your own account'}), 403
    
    try:
        # Delete user's files from filesystem
        user_storage_path = os.path.join(current_app.config['UPLOAD_FOLDER'], 'users', str(user.id))
        if os.path.exists(user_storage_path):
            shutil.rmtree(user_storage_path)
            logger.info(f"Deleted storage for user {user.id}: {user_storage_path}")
        
        # Delete UserTheme FIRST (before any cascade can try to set user_id=NULL)
        UserTheme.query.filter_by(user_id=user.id).delete(synchronize_session='fetch')
        db.session.flush()  # Force the delete to execute immediately
        
        # Delete all related records (foreign key constraints)
        Note.query.filter_by(user_id=user.id).delete()
        TrashedFile.query.filter_by(user_id=user.id).delete()
        ShareLink.query.filter_by(created_by=user.id).delete()
        FileVersion.query.filter_by(created_by=user.id).delete()
        ActivityLog.query.filter_by(user_id=user.id).delete()
        StorageRequest.query.filter_by(user_id=user.id).delete()
        StorageRequest.query.filter_by(responded_by=user.id).update({'responded_by': None})
        Notification.query.filter_by(user_id=user.id).delete()
        File.query.filter_by(user_id=user.id).delete()
        Tag.query.filter_by(user_id=user.id).delete()
        UserGroups.query.filter_by(user_id=user.id).delete()
        
        # Log the deletion before deleting user
        log = ActivityLog(
            user_id=current_user.id,
            action='user_deletion',
            details=f'Deleted user: {user.username}',
            ip_address=get_client_ip(),
            timestamp=datetime.utcnow()
        )
        db.session.add(log)
        
        # Delete user from database
        db.session.delete(user)
        db.session.commit()
        
        return jsonify({'message': 'User deleted successfully'})
    except Exception as e:
        db.session.rollback()
        logger.error(f'Error deleting user {user_id}: {str(e)}')
        return jsonify({'error': str(e)}), 500

@admin_bp.route('/user/<int:user_id>/make_admin', methods=['POST'])
@admin_required
def make_admin(user_id):
    if current_user.is_demo:
        flash("Demo user can't grant admin rights.", 'warning')
        return redirect(url_for('admin.manage_users'))

    user = User.query.get_or_404(user_id)
    if user.is_admin:
        flash(f'{user.username} is already an admin.', 'info')
        return redirect(url_for('admin.manage_users'))
    user.is_admin = True
    log = ActivityLog(user_id=current_user.id, action='admin_status_granted',
                      details=f'Admin status granted to user: {user.username}',
                      ip_address=get_client_ip(), timestamp=datetime.utcnow())
    db.session.add(log)
    db.session.commit()
    flash(f'Admin privileges granted to {user.username}.', 'success')
    return redirect(url_for('admin.manage_users'))

@admin_bp.route('/user/<int:user_id>/revoke_admin', methods=['POST'])
@admin_required
def revoke_admin(user_id):
    if current_user.is_demo:
        flash("Demo user can't revoke admin rights.", 'warning')
        return redirect(url_for('admin.manage_users'))

    if user_id == 1 or user_id == current_user.id:
        flash('Cannot revoke this admin account.', 'error')
        return redirect(url_for('admin.manage_users'))
    user = User.query.get_or_404(user_id)
    if not user.is_admin:
        flash(f'{user.username} is not an admin.', 'info')
        return redirect(url_for('admin.manage_users'))
    user.is_admin = False
    log = ActivityLog(user_id=current_user.id, action='admin_status_revoked',
                      details=f'Admin status revoked from user: {user.username}',
                      ip_address=get_client_ip(), timestamp=datetime.utcnow())
    db.session.add(log)
    db.session.commit()
    flash(f'Admin privileges revoked from {user.username}.', 'success')
    return redirect(url_for('admin.manage_users'))

@admin_bp.route('/users/delete/<int:user_id>', methods=['POST'])
@admin_required
def delete_user(user_id):
    if current_user.is_demo:
        flash("Demo user can't delete users.", 'warning')
        return redirect(url_for('admin.manage_users'))

    if user_id == 1 or user_id == current_user.id:
        flash('Cannot delete this account.', 'error')
        return redirect(url_for('admin.manage_users'))

    user = User.query.get_or_404(user_id)
    if user.is_admin and current_user.id != 1:
        flash('Only the default admin can delete other admins.', 'error')
        return redirect(url_for('admin.manage_users'))

    try:
        # Use configured upload folder path
        user_storage_path = os.path.join(current_app.config['UPLOAD_FOLDER'], str(user.id))
        if os.path.exists(user_storage_path):
            shutil.rmtree(user_storage_path)
            logger.info(f"Deleted storage for user {user.id}: {user_storage_path}")
        UserTheme.query.filter_by(user_id=user.id).delete()
        Note.query.filter_by(user_id=user.id).delete()
        Notification.query.filter_by(user_id=user.id).delete()
        ActivityLog.query.filter_by(user_id=user.id).delete()
        StorageRequest.query.filter_by(user_id=user.id).delete()
        StorageRequest.query.filter_by(responded_by=user.id).update({'responded_by': None})
        ShareLink.query.filter_by(created_by=user.id).delete()
        FileVersion.query.filter_by(created_by=user.id).delete()
        TrashedFile.query.filter_by(user_id=user.id).delete()
        File.query.filter_by(user_id=user.id).delete()
        Tag.query.filter_by(user_id=user.id).delete()
        UserGroups.query.filter_by(user_id=user.id).delete()
        log = ActivityLog(user_id=current_user.id, action='user_deletion',
                          details=f'Deleted user: {user.username}',
                          ip_address=get_client_ip(), timestamp=datetime.utcnow())
        db.session.add(log)
        db.session.delete(user)
        db.session.commit()
        flash(f'User {user.username} deleted successfully.', 'success')
        return redirect(url_for('admin.manage_users'))
    except Exception as e:
        db.session.rollback()
        flash(f'Error deleting user: {str(e)}', 'error')
        return redirect(url_for('admin.manage_users'))

@admin_bp.route('/storage_requests')
@admin_required
def view_storage_requests():
    if current_user.is_demo:
        flash("Demo user can't process storage requests.", 'warning')
        return render_template('admin/storage_requests.html', requests=[])

    requests = StorageRequest.query.order_by(StorageRequest.created_at.desc()).all()
    return render_template('admin/storage_requests.html', requests=requests)

@admin_bp.route('/storage_request/<int:request_id>/process', methods=['POST'])
@admin_required
def handle_storage_request(request_id):
    if current_user.is_demo:
        flash("Demo user can't process storage requests.", 'warning')
        return redirect(url_for('admin.view_storage_requests'))

    storage_request = StorageRequest.query.get_or_404(request_id)
    action = request.form.get('action')
    if action not in ['approve', 'deny']:
        flash('Invalid action.', 'error')
        return redirect(url_for('admin.view_storage_requests'))
    if storage_request.status != 'pending':
        flash('This request has already been processed.', 'error')
        return redirect(url_for('admin.view_storage_requests'))
    user = User.query.get(storage_request.user_id)
    if action == 'approve':
        user.storage_limit = storage_request.requested_size
        storage_request.status = 'approved'
        flash(f'Storage request for {user.username} has been approved.', 'success')
    else:
        storage_request.status = 'denied'
        flash(f'Storage request for {user.username} has been denied.', 'info')
    storage_request.responded_at = datetime.utcnow()
    storage_request.responded_by = current_user.id
    log = ActivityLog(user_id=current_user.id, action=f'storage_request_{action}',
                      details=f'Storage request {action}d for user: {user.username}',
                      ip_address=get_client_ip(), timestamp=datetime.utcnow())
    db.session.add(log)
    
    # Send storage request notification email
    try:
        from app.utils.email_utils import send_storage_request_notification
        send_storage_request_notification(
            user,
            approved=(action == 'approve'),
            new_limit_bytes=storage_request.requested_size if action == 'approve' else None
        )
    except Exception:
        pass
    
    db.session.delete(storage_request)
    db.session.commit()
    return redirect(url_for('admin.view_storage_requests'))

@admin_bp.route('/user/<int:user_id>', methods=['GET'])
@admin_required
def user_detail(user_id):
    if current_user.is_demo:
        flash("Demo user can't view user details.", 'warning')
        return redirect(url_for('admin.manage_users'))

    user = User.query.get_or_404(user_id)
    return render_template('admin/user_detail.html', user=user)
