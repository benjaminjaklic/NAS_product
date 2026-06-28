"""
Trash management routes for soft-deleted files
"""
from flask import Blueprint, request, jsonify, current_app
from flask_login import login_required, current_user
from app.models import db, File, TrashedFile, ActivityLog, ShareLink, FileVersion
from app.utils.security_utils import get_client_ip
from datetime import datetime, timedelta
import os
import shutil
import logging

logger = logging.getLogger(__name__)

trash_bp = Blueprint('trash', __name__, url_prefix='/api/trash')


def get_trash_folder():
    """Get the trash folder path"""
    base_folder = current_app.config.get('UPLOAD_FOLDER', 'files')
    trash_folder = os.path.join(base_folder, '.trash')
    os.makedirs(trash_folder, exist_ok=True)
    return trash_folder


@trash_bp.route('/')
@login_required
def get_trashed_files():
    """Get all trashed files for current user"""
    trashed = TrashedFile.query.filter_by(user_id=current_user.id).order_by(
        TrashedFile.deleted_at.desc()
    ).all()
    
    return jsonify({
        'files': [f.to_dict() for f in trashed],
        'total': len(trashed)
    })


@trash_bp.route('/restore/<int:trash_id>', methods=['POST'])
@login_required
def restore_file(trash_id):
    """Restore a file from trash"""
    trashed = TrashedFile.query.filter_by(
        id=trash_id, 
        user_id=current_user.id
    ).first()
    
    if not trashed:
        return jsonify({'error': 'File not found in trash'}), 404
    
    if trashed.is_expired():
        return jsonify({'error': 'File has expired and cannot be restored'}), 400
    
    try:
        # Move file back from trash
        trash_path = trashed.path
        original_path = trashed.original_path
        
        if os.path.exists(trash_path):
            # Ensure destination directory exists
            os.makedirs(os.path.dirname(original_path), exist_ok=True)
            shutil.move(trash_path, original_path)
        
        # Check if original File record still exists (it should, with DELETED tag)
        from app.models import File, Tag
        existing_file = File.query.filter_by(id=trashed.original_file_id).first()
        
        if existing_file:
            # Remove DELETED tag and update path
            deleted_tag = Tag.query.filter_by(name='DELETED', is_system=True).first()
            if deleted_tag and deleted_tag in existing_file.tags:
                existing_file.tags.remove(deleted_tag)
            existing_file.path = original_path
            restored_file = existing_file
        else:
            # Fallback: recreate File record if it was somehow deleted
            restored_file = File(
                filename=trashed.filename,
                original_filename=trashed.original_filename,
                file_type=trashed.file_type,
                file_size=trashed.file_size,
                category=trashed.category,
                path=original_path,
                user_id=current_user.id,
                uploaded_at=datetime.utcnow(),
                is_public=False
            )
            db.session.add(restored_file)
        
        # Update user storage
        current_user.storage_used = (current_user.storage_used or 0) + (trashed.file_size or 0)
        
        # Remove from trash table
        db.session.delete(trashed)
        
        # Log activity
        log = ActivityLog(
            user_id=current_user.id,
            action='file_restore',
            ip_address=get_client_ip(),
            details=f'Restored file: {trashed.original_filename}',
            timestamp=datetime.utcnow()
        )
        db.session.add(log)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'File restored successfully',
            'file': {
                'id': restored_file.id,
                'filename': restored_file.original_filename
            }
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f'Failed to restore file: {str(e)}')
        return jsonify({'error': f'Failed to restore file: {str(e)}'}), 500


@trash_bp.route('/delete/<int:trash_id>', methods=['DELETE'])
@login_required
def permanently_delete(trash_id):
    """Permanently delete a file from trash"""
    trashed = TrashedFile.query.filter_by(
        id=trash_id, 
        user_id=current_user.id
    ).first()
    
    if not trashed:
        return jsonify({'error': 'File not found in trash'}), 404
    
    try:
        # Delete the actual file
        if os.path.exists(trashed.path):
            os.remove(trashed.path)
        
        filename = trashed.original_filename
        
        # Also delete the associated File record (kept with DELETED tag)
        original_file = File.query.filter_by(id=trashed.original_file_id).first()
        if original_file:
            # Delete physical file at original path too (fallback)
            if original_file.path and os.path.exists(original_file.path):
                os.remove(original_file.path)
            # Remove associated share links and versions (file_id is NOT NULL)
            ShareLink.query.filter_by(file_id=original_file.id).delete()
            FileVersion.query.filter_by(file_id=original_file.id).delete()
            db.session.delete(original_file)
        
        # Remove from database
        db.session.delete(trashed)
        
        # Log activity
        log = ActivityLog(
            user_id=current_user.id,
            action='file_permanent_delete',
            ip_address=get_client_ip(),
            details=f'Permanently deleted: {filename}',
            timestamp=datetime.utcnow()
        )
        db.session.add(log)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'File permanently deleted'
        })
        
    except Exception as e:
        db.session.rollback()
        logger.error(f'Failed to permanently delete file: {str(e)}')
        return jsonify({'error': f'Failed to delete file: {str(e)}'}), 500


@trash_bp.route('/empty', methods=['DELETE'])
@login_required
def empty_trash():
    """Empty all files from user's trash"""
    trashed_files = TrashedFile.query.filter_by(user_id=current_user.id).all()
    
    deleted_count = 0
    errors = []
    
    for trashed in trashed_files:
        try:
            if os.path.exists(trashed.path):
                os.remove(trashed.path)
            # Also delete the associated File record (kept with DELETED tag)
            original_file = File.query.filter_by(id=trashed.original_file_id).first()
            if original_file:
                if original_file.path and os.path.exists(original_file.path):
                    os.remove(original_file.path)
                # Remove associated share links and versions (file_id is NOT NULL)
                ShareLink.query.filter_by(file_id=original_file.id).delete()
                FileVersion.query.filter_by(file_id=original_file.id).delete()
                db.session.delete(original_file)
            db.session.delete(trashed)
            deleted_count += 1
        except Exception as e:
            errors.append(f'{trashed.original_filename}: {str(e)}')
    
    # Log activity
    log = ActivityLog(
        user_id=current_user.id,
        action='trash_empty',
        ip_address=get_client_ip(),
        details=f'Emptied trash: {deleted_count} files deleted',
        timestamp=datetime.utcnow()
    )
    db.session.add(log)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'deleted': deleted_count,
        'errors': errors if errors else None
    })


def move_file_to_trash(file_obj, retention_days=30):
    """
    Move a file to trash instead of deleting it permanently.
    Called from files.py when user deletes a file.
    """
    trash_folder = get_trash_folder()
    
    # Generate unique trash filename
    timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
    trash_filename = f"{timestamp}_{file_obj.id}_{file_obj.filename}"
    trash_path = os.path.join(trash_folder, str(file_obj.user_id), trash_filename)
    
    # Ensure user's trash folder exists
    os.makedirs(os.path.dirname(trash_path), exist_ok=True)
    
    # Move the file
    original_path = file_obj.path
    if os.path.exists(original_path):
        shutil.move(original_path, trash_path)
    
    # Create trash record
    trashed = TrashedFile(
        original_file_id=file_obj.id,
        user_id=file_obj.user_id,
        filename=file_obj.filename,
        original_filename=file_obj.original_filename,
        file_type=file_obj.file_type,
        file_size=file_obj.file_size,
        category=file_obj.category,
        path=trash_path,
        original_path=original_path,
        deleted_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(days=retention_days)
    )
    db.session.add(trashed)
    
    return trashed


def cleanup_expired_trash():
    """
    Remove files that have been in trash longer than retention period.
    Should be called periodically by a background task.
    """
    expired = TrashedFile.query.filter(
        TrashedFile.expires_at < datetime.utcnow()
    ).all()
    
    deleted_count = 0
    for trashed in expired:
        try:
            if os.path.exists(trashed.path):
                os.remove(trashed.path)
            # Also delete the associated File record (kept with DELETED tag)
            original_file = File.query.filter_by(id=trashed.original_file_id).first()
            if original_file:
                if original_file.path and os.path.exists(original_file.path):
                    os.remove(original_file.path)
                # Remove associated share links and versions (file_id is NOT NULL)
                ShareLink.query.filter_by(file_id=original_file.id).delete()
                FileVersion.query.filter_by(file_id=original_file.id).delete()
                db.session.delete(original_file)
            db.session.delete(trashed)
            deleted_count += 1
        except Exception as e:
            logger.error(f'Failed to cleanup expired trash: {str(e)}')
    
    if deleted_count > 0:
        db.session.commit()
        logger.info(f'Cleaned up {deleted_count} expired files from trash')
    
    return deleted_count
