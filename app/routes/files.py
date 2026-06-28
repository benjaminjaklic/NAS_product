from flask import Blueprint, render_template, request, jsonify, current_app, send_file, abort, flash, redirect, url_for
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
from app.models import db, File, ActivityLog, StorageRequest, Tag, User
from app.utils.security_utils import validate_file_path, get_client_ip
from app.utils.speed_limiter import get_user_speed_limits, make_throttled_download_response, make_throttled_inline_response, throttled_range_stream, throttled_save
import os
import shutil
import mimetypes
from datetime import datetime
import requests
from pypdf import PdfReader
import logging

logger = logging.getLogger(__name__)

files_bp = Blueprint('files', __name__, url_prefix='/files')

def allowed_file(filename):
    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    # Only block potentially dangerous files
    return ext not in current_app.config['BLOCKED_EXTENSIONS']

@files_bp.route('/dashboard')
@login_required
def dashboard():
    tag_id = request.args.get('tag')
    
    # Base query - only get files belonging to the current user
    query = File.query.filter_by(user_id=current_user.id)
    
    # Apply tag filter if specified
    if tag_id:
        try:
            tag_id = int(tag_id)
            query = query.join(File.tags).filter(Tag.id == tag_id)
        except ValueError:
            pass
    
    # Get files ordered by upload date
    files = query.order_by(File.uploaded_at.desc()).all()
    
    # Get all tags for tag selection
    tags = Tag.query.filter((Tag.user_id == current_user.id) | (Tag.is_system == True)).all()
    
    return render_template('files/dashboard.html', files=files, tags=tags)

@files_bp.route('/upload', methods=['POST'])
@login_required
def upload_file():
    logger.info(f"Upload request from user {current_user.username} (ID: {current_user.id})")
    
    if 'file' not in request.files:
        logger.warning(f"Upload failed: No file part in request from user {current_user.id}")
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        logger.warning(f"Upload failed: Empty filename from user {current_user.id}")
        return jsonify({'error': 'No selected file'}), 400

    logger.debug(f"Processing upload: {file.filename} ({file.content_type})")
    
    # Check if file type is allowed
    if not allowed_file(file.filename):
        ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
        logger.warning(f"Upload rejected: Blocked file type '{ext}' from user {current_user.id}")
        return jsonify({'error': f'File type not allowed: {ext}'}), 400
    
    # Early quota check: reject BEFORE writing any data to disk
    content_length = request.content_length or 0
    if content_length > 0:
        storage_used = current_user.storage_used or 0
        role = current_user.role_obj
        storage_limit = role.storage_quota if (role and role.storage_quota) else (current_user.storage_limit or float('inf'))
        available = storage_limit - storage_used
        if content_length > available:
            from app.config import Config
            logger.warning(f"Upload rejected: file size {content_length} exceeds available {available} for user {current_user.id}")
            return jsonify({'error': f'This file ({Config.format_size(content_length)}) exceeds your remaining storage ({Config.format_size(available)}). Delete some files or request more storage.'}), 400
    
    try:
        filename = secure_filename(file.filename)
        category = request.form.get('category', 'other')
        
        # Get tags if any were selected
        tag_ids = request.form.getlist('tags')
        selected_tags = []
        if tag_ids:
            try:
                selected_tags = Tag.query.filter(Tag.id.in_(tag_ids)).all()
            except Exception as e:
                logger.error(f"Error retrieving tags: {str(e)}")
        
        # Create user directory if it doesn't exist
        user_dir = os.path.join(current_app.config['UPLOAD_FOLDER'], str(current_user.id))
        
        if not os.path.exists(user_dir):
            try:
                os.makedirs(user_dir, exist_ok=True)
                logger.info(f"Created user directory: {user_dir}")
            except Exception as e:
                logger.error(f"Error creating user directory: {str(e)}")
                return jsonify({'error': f'Could not create storage directory: {str(e)}'}), 500
        
        # Generate unique filename if file already exists
        base_name, extension = os.path.splitext(filename)
        counter = 1
        final_filename = filename
        while os.path.exists(os.path.join(user_dir, final_filename)):
            final_filename = f"{base_name}_{counter}{extension}"
            counter += 1
        
        # Create the full file path
        file_path = os.path.join(user_dir, final_filename)
        
        # Validate the destination path is safe
        if not validate_file_path(file_path):
            logger.error(f"Invalid file path attempted: {file_path}")
            return jsonify({'error': 'Invalid file path'}), 400
        
        # Save file temporarily to check size (with upload speed throttling)
        temp_path = os.path.join(user_dir, f"temp_{final_filename}")
        upload_limit, _ = get_user_speed_limits(current_user)
        
        if upload_limit > 0:
            # Throttled save — applies backpressure on the write side
            throttled_save(file.stream, temp_path, speed_limit=upload_limit)
        else:
            file.save(temp_path)
        
        # Get file size
        file_size = os.path.getsize(temp_path)
        
        # Check storage limit using live role quota
        storage_used = current_user.storage_used or 0
        role = current_user.role_obj
        if role and role.storage_quota:
            storage_limit = role.storage_quota
        else:
            storage_limit = current_user.storage_limit or float('inf')
        if storage_used + file_size > storage_limit:
            logger.info(f"Storage limit exceeded for user {current_user.id}: needed {file_size}, available {current_user.storage_limit - current_user.storage_used}")
            os.remove(temp_path)
            return jsonify({'error': 'Storage limit exceeded'}), 400
        
        # Move from temp file to final location
        try:
            os.rename(temp_path, file_path)
        except Exception as e:
            logger.error(f"Error moving file from temp location: {str(e)}")
            if os.path.exists(temp_path):
                os.remove(temp_path)
            return jsonify({'error': f'Error saving file: {str(e)}'}), 500
        
        # Update user's storage usage (handle None)
        if current_user.storage_used is None:
            current_user.storage_used = 0
        current_user.storage_used += file_size
        
        # Get file type
        file_type = category
        if not file_type:
            mime_type = mimetypes.guess_type(filename)[0]
            if mime_type:
                file_type = mime_type.split('/')[0]
            else:
                file_type = 'other'
        
        # Create file record
        new_file = File(
            filename=final_filename,
            original_filename=file.filename,
            file_type=file_type,
            file_size=file_size,
            category=category,
            path=file_path,
            user_id=current_user.id,
            uploaded_at=datetime.utcnow(),
            is_public=False
        )
        
        # Add selected tags to the file
        for tag in selected_tags:
            new_file.tags.append(tag)
        
        # Automatically add FOLDER tag to archive files
        if final_filename.lower().endswith(('.zip', '.rar', '.7z', '.tar.gz', '.tar')):
            folder_tag = Tag.query.filter_by(name='FOLDER', is_system=True).first()
            if folder_tag and folder_tag not in new_file.tags:
                new_file.tags.append(folder_tag)
        
        # Log activity
        activity = ActivityLog(
            user_id=current_user.id,
            action='file_upload',
            details=f'Uploaded file: {final_filename}',
            ip_address=get_client_ip(),
            timestamp=datetime.utcnow()
        )
        
        # Add records to database
        db.session.add(new_file)
        db.session.add(activity)
        
        # Commit transaction
        try:
            db.session.commit()
            logger.info(f"File uploaded successfully: {final_filename} by user {current_user.id}")
        except Exception as e:
            logger.error(f"Database error during upload: {str(e)}")
            db.session.rollback()
            if os.path.exists(file_path):
                os.remove(file_path)
            return jsonify({'error': f'Database error: {str(e)}'}), 500
        
        # Check if this is an AJAX request
        is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        if is_ajax:
            return jsonify({
                'message': 'File uploaded successfully',
                'file_id': new_file.id,
                'filename': new_file.original_filename
            }), 200
        else:
            # For non-AJAX requests, redirect to the dashboard
            flash('File uploaded successfully', 'success')
            return redirect(url_for('files.dashboard'))
        
    except Exception as e:
        logger.exception(f"Unhandled error in upload from user {current_user.id}")
        
        # Clean up any temporary files
        if 'temp_path' in locals() and os.path.exists(temp_path):
            os.remove(temp_path)
        if 'file_path' in locals() and os.path.exists(file_path):
            os.remove(file_path)
        
        # Roll back any database changes
        db.session.rollback()
        
        is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        if is_ajax:
            return jsonify({'error': f'Upload failed: {str(e)}'}), 500
        else:
            flash(f'Upload failed: {str(e)}', 'danger')
            return redirect(url_for('files.dashboard'))

@files_bp.route('/download/<int:file_id>')
@login_required
def download_file(file_id):
    file = File.query.get_or_404(file_id)
    
    # Check if user has access to file
    if file.user_id != current_user.id and not current_user.is_admin:
        logger.warning(f"Unauthorized download attempt: user={current_user.id}, file={file_id}")
        abort(403)
    
    # Validate file path to prevent path traversal
    if not validate_file_path(file.path):
        logger.error(f"Invalid file path on download: file={file_id}, path={file.path}")
        abort(404)
    
    # Check file exists
    if not os.path.exists(file.path):
        logger.error(f"File not found on disk: file={file_id}, path={file.path}")
        abort(404)
    
    # Log download
    activity = ActivityLog(
        user_id=current_user.id,
        action='file_download',
        details=f'Downloaded file: {file.filename}',
        ip_address=get_client_ip(),
        timestamp=datetime.utcnow()
    )
    db.session.add(activity)
    
    # Update last accessed
    file.last_accessed = datetime.utcnow()
    db.session.commit()
    
    logger.info(f"File downloaded: {file.filename} by user {current_user.id}")
    
    # Apply download speed limit based on user's role
    _, download_limit = get_user_speed_limits(current_user)
    
    return make_throttled_download_response(
        file.path,
        download_name=file.original_filename,
        speed_limit=download_limit
    )

@files_bp.route('/delete/<int:file_id>', methods=['POST'])
@login_required
def delete_file(file_id):
    """Mark file as deleted by adding DELETED tag"""
    logger.info(f"Delete request: user={current_user.id}, file={file_id}")
    
    file = File.query.get_or_404(file_id)
    
    # Check if user owns the file
    if file.user_id != current_user.id and not current_user.is_admin:
        logger.warning(f"Unauthorized delete attempt: user={current_user.id}, file={file_id}")
        return jsonify({'error': 'Permission denied'}), 403
    
    try:
        from app.routes.trash import move_file_to_trash
        
        # Move physical file to trash and create TrashedFile record
        trashed = move_file_to_trash(file)
        
        # Free storage quota since trashed files don't count
        if file.file_size:
            current_user.storage_used = max(0, (current_user.storage_used or 0) - file.file_size)
        
        # Get or create DELETED system tag (for Dashboard 'Show Deleted' view)
        deleted_tag = Tag.query.filter_by(name='DELETED', is_system=True).first()
        if not deleted_tag:
            deleted_tag = Tag(
                name='DELETED',
                color='#dc3545',
                is_system=True,
                created_at=datetime.utcnow()
            )
            db.session.add(deleted_tag)
            db.session.flush()
        
        # Add DELETED tag to file for Dashboard view
        if deleted_tag not in file.tags:
            file.tags.append(deleted_tag)
        
        # Log deletion
        activity = ActivityLog(
            user_id=current_user.id,
            action='file_delete',
            details=f'Moved file to trash: {file.filename}',
            ip_address=get_client_ip(),
            timestamp=datetime.utcnow()
        )
        db.session.add(activity)
        
        db.session.commit()
        logger.info(f"File {file_id} moved to trash by user {current_user.id}")
        
        # Check if this is an AJAX request
        is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        if is_ajax:
            return jsonify({'message': 'File moved to trash'}), 200
        else:
            flash('File moved to trash', 'success')
            return redirect(url_for('files.dashboard'))
    except Exception as e:
        logger.exception(f"Error marking file {file_id} as deleted")
        db.session.rollback()
        
        is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        if is_ajax:
            return jsonify({'error': str(e)}), 500
        else:
            flash(f'Error marking file as deleted: {str(e)}', 'danger')
            return redirect(url_for('files.dashboard'))


@files_bp.route('/permanent-delete/<int:file_id>', methods=['POST'])
@login_required
def permanent_delete_file(file_id):
    """Permanently delete a file from disk and database"""
    logger.info(f"Permanent delete request: user={current_user.id}, file={file_id}")
    
    file = File.query.get_or_404(file_id)
    
    if file.user_id != current_user.id and not current_user.is_admin:
        logger.warning(f"Unauthorized permanent delete: user={current_user.id}, file={file_id}")
        return jsonify({'error': 'Permission denied'}), 403
    
    try:
        file_path = file.path
        file_size = file.file_size or 0
        filename = file.original_filename or file.filename
        
        # Also find and delete the associated TrashedFile record (physical file is in .trash/)
        from app.models import TrashedFile
        trashed = TrashedFile.query.filter_by(original_file_id=file_id).first()
        if trashed:
            if os.path.exists(trashed.path):
                os.remove(trashed.path)
            db.session.delete(trashed)
        
        # Delete physical file at original path (fallback)
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
        
        # NOTE: storage was already freed when file was soft-deleted (moved to trash),
        # so do NOT subtract again here to avoid double-counting.
        
        # Remove associated share links and file versions (file_id is NOT NULL, can't orphan them)
        from app.models import ShareLink, FileVersion
        ShareLink.query.filter_by(file_id=file.id).delete()
        FileVersion.query.filter_by(file_id=file.id).delete()
        
        # Remove file record
        db.session.delete(file)
        
        # Log activity
        activity = ActivityLog(
            user_id=current_user.id,
            action='file_permanent_delete',
            details=f'Permanently deleted: {filename}',
            ip_address=get_client_ip(),
            timestamp=datetime.utcnow()
        )
        db.session.add(activity)
        db.session.commit()
        
        logger.info(f"File {file_id} permanently deleted by user {current_user.id}")
        return jsonify({'message': 'File permanently deleted', 'freed': file_size}), 200
        
    except Exception as e:
        logger.exception(f"Error permanently deleting file {file_id}")
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@files_bp.route('/restore/<int:file_id>', methods=['POST'])
@login_required
def restore_file(file_id):
    """Restore a deleted file by moving it back from trash and removing DELETED tag"""
    logger.info(f"Restore request: user={current_user.id}, file={file_id}")
    
    file = File.query.get_or_404(file_id)
    
    if file.user_id != current_user.id and not current_user.is_admin:
        logger.warning(f"Unauthorized restore attempt: user={current_user.id}, file={file_id}")
        return jsonify({'error': 'Permission denied'}), 403
    
    try:
        # Find associated TrashedFile record and move physical file back
        from app.models import TrashedFile
        trashed = TrashedFile.query.filter_by(original_file_id=file_id).first()
        if trashed and os.path.exists(trashed.path):
            os.makedirs(os.path.dirname(trashed.original_path), exist_ok=True)
            shutil.move(trashed.path, trashed.original_path)
            file.path = trashed.original_path
            db.session.delete(trashed)
        
        # Get DELETED system tag
        deleted_tag = Tag.query.filter_by(name='DELETED', is_system=True).first()
        
        if deleted_tag and deleted_tag in file.tags:
            file.tags.remove(deleted_tag)
            
            # Restore storage quota
            if file.file_size:
                current_user.storage_used = (current_user.storage_used or 0) + file.file_size
            
            # Log restoration
            activity = ActivityLog(
                user_id=current_user.id,
                action='file_restore',
                details=f'Restored file: {file.filename}',
                ip_address=get_client_ip(),
                timestamp=datetime.utcnow()
            )
            db.session.add(activity)
            
            db.session.commit()
            logger.info(f"File {file_id} restored by user {current_user.id}")
            
            return jsonify({'message': 'File restored successfully'}), 200
        else:
            return jsonify({'message': 'File is not in deleted state'}), 400
            
    except Exception as e:
        logger.exception(f"Error restoring file {file_id}")
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@files_bp.route('/tag/<int:file_id>', methods=['POST'])
@login_required
def tag_file(file_id):
    """Add or remove tags from a file"""
    file = File.query.get_or_404(file_id)
    
    # Check if user owns the file
    if file.user_id != current_user.id:
        abort(403)
    
    try:
        # Get tags from form
        tag_ids = request.form.getlist('tags')
        
        # Clear existing tags (except system tags like FOLDER for archives)
        current_tags = list(file.tags)
        for tag in current_tags:
            if tag.is_system and file.is_archive() and tag.name == 'FOLDER':
                continue  # Don't remove FOLDER tag from archives
            file.tags.remove(tag)
        
        # Add selected tags (but prevent DELETED tag from being manually assigned)
        if tag_ids:
            tags = Tag.query.filter(Tag.id.in_(tag_ids)).all()
            for tag in tags:
                # Don't allow users to manually add DELETED tag
                if tag.name == 'DELETED' and tag.is_system:
                    continue
                file.tags.append(tag)
        
        db.session.commit()
        
        # Log tag update
        activity = ActivityLog(
            user_id=current_user.id,
            action='file_tag',
            details=f'Updated tags for file: {file.filename}',
            ip_address=get_client_ip(),
            timestamp=datetime.utcnow()
        )
        db.session.add(activity)
        db.session.commit()
        
        logger.info(f"Tags updated successfully for file {file_id} by user {current_user.id}")
        
        return jsonify({'message': 'Tags updated successfully'}), 200
    except Exception as e:
        db.session.rollback()
        logger.error(f"Error updating tags for file {file_id}: {str(e)}")
        return jsonify({'error': str(e)}), 500

@files_bp.route('/get-tags/<int:file_id>')
@login_required
def get_file_tags(file_id):
    """Get tags for a file"""
    file = File.query.get_or_404(file_id)
    
    # Check if user owns the file
    if file.user_id != current_user.id:
        abort(403)
    
    # Return tag IDs
    tag_ids = [tag.id for tag in file.tags]
    return jsonify({'tags': tag_ids})

@files_bp.route('/tags', methods=['GET', 'POST'])
@login_required
def manage_tags():
    """Manage user's tags"""
    is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
    
    if request.method == 'POST':
        action = request.form.get('action')
        
        if action == 'create':
            name = request.form.get('name')
            color = request.form.get('color', '#6c757d')
            
            if not name:
                if is_ajax:
                    return jsonify({'error': 'Tag name is required'}), 400
                flash('Tag name is required', 'danger')
                return redirect(url_for('files.manage_tags'))
            
            # Check if tag already exists
            existing_tag = Tag.query.filter(
                (Tag.name == name) & 
                ((Tag.user_id == current_user.id) | (Tag.is_system == True))
            ).first()
            
            if existing_tag:
                if is_ajax:
                    return jsonify({'error': 'Tag already exists'}), 400
                flash('Tag already exists', 'danger')
            else:
                new_tag = Tag(
                    name=name,
                    color=color,
                    user_id=current_user.id,
                    created_at=datetime.utcnow()
                )
                db.session.add(new_tag)
                db.session.commit()
                
                if is_ajax:
                    return jsonify({
                        'success': True,
                        'tag': {
                            'id': new_tag.id,
                            'name': new_tag.name,
                            'color': new_tag.color,
                            'is_system': new_tag.is_system
                        }
                    })
                flash('Tag created successfully', 'success')
        
        elif action == 'delete':
            tag_id = request.form.get('tag_id')
            tag = Tag.query.get_or_404(tag_id)
            
            # Check if user owns the tag
            if tag.user_id != current_user.id:
                if is_ajax:
                    return jsonify({'error': 'Permission denied'}), 403
                abort(403)
            
            # Don't allow deleting system tags
            if tag.is_system:
                if is_ajax:
                    return jsonify({'error': 'Cannot delete system tags'}), 400
                flash('Cannot delete system tags', 'danger')
            else:
                db.session.delete(tag)
                db.session.commit()
                if is_ajax:
                    return jsonify({'success': True, 'message': 'Tag deleted successfully'})
                flash('Tag deleted successfully', 'success')
        
        if is_ajax:
            return jsonify({'success': True})
        return redirect(url_for('files.manage_tags'))
    
    # Get user's tags and system tags (exclude DELETED tag - it's internal only)
    tags = Tag.query.filter(
        ((Tag.user_id == current_user.id) | (Tag.is_system == True)) &
        (Tag.name != 'DELETED')
    ).all()
    
    if is_ajax:
        return jsonify({
            'tags': [{
                'id': t.id,
                'name': t.name,
                'color': t.color,
                'is_system': t.is_system
            } for t in tags if t.name != 'DELETED']
        })
    
    return render_template('files/tags.html', tags=tags)

@files_bp.route('/request_storage', methods=['POST'])
@login_required
def request_storage():
    """Request a storage increase"""
    requested_size = request.form.get('requested_size')
    reason = request.form.get('reason')
    
    if not requested_size or not reason:
        flash('Please provide both size and reason', 'danger')
        return redirect(url_for('auth.profile'))
    
    try:
        requested_size = int(requested_size)
        if requested_size <= current_user.storage_limit:
            flash('Requested size must be greater than current limit', 'danger')
            return redirect(url_for('auth.profile'))
        
        # Create storage request
        storage_request = StorageRequest(
            user_id=current_user.id,
            requested_size=requested_size,
            reason=reason,
            status='pending',
            created_at=datetime.utcnow()
        )
        
        # Log request
        activity = ActivityLog(
            user_id=current_user.id,
            action='storage_request',
            details=f'Storage increase request: {requested_size} bytes',
            ip_address=get_client_ip(),
            timestamp=datetime.utcnow()
        )
        
        db.session.add(storage_request)
        db.session.add(activity)
        db.session.commit()
        
        flash('Storage request submitted successfully', 'success')
        
    except ValueError:
        flash('Invalid storage size', 'danger')
    except Exception as e:
        db.session.rollback()
        flash(f'Error: {str(e)}', 'danger')
    
    return redirect(url_for('auth.profile'))

@files_bp.route('/list')
@login_required
def file_list():
    """Return a partial HTML with just the file list"""
    # Get filter parameters
    tag_filter = request.args.get('tag')
    
    # Base query - only get files belonging to the current user
    query = File.query.filter_by(user_id=current_user.id)
    
    # Apply tag filter if specified
    if tag_filter:
        try:
            tag_id = int(tag_filter)
            query = query.join(File.tags).filter(Tag.id == tag_id)
        except ValueError:
            pass
    
    # Get files ordered by upload date
    files = query.order_by(File.uploaded_at.desc()).all()
    tags = Tag.query.filter((Tag.user_id == current_user.id) | (Tag.is_system == True)).all()
    
    return render_template('files/partials/file_list.html', files=files, tags=tags)



# AI Summarization API - configure via environment variable or config
AI_SUMMARIZE_API = os.environ.get('AI_SUMMARIZE_API', 'http://localhost:8000/summarize')

@files_bp.route('/summarize/<int:file_id>')
@login_required
def summarize_file(file_id):
    file = File.query.get_or_404(file_id)
    
    if file.user_id != current_user.id:
        abort(403)

    if not os.path.exists(file.path):
        flash("File doesn't exist.", "danger")
        return redirect(url_for("files.dashboard"))

    ext = os.path.splitext(file.filename)[1].lower()
    
    try:
        # 🔹 Preberi besedilo glede na končnico
        if ext == ".txt":
            with open(file.path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
        elif ext == ".pdf":
            reader = PdfReader(file.path)
            content = "\n".join(page.extract_text() or "" for page in reader.pages)
        else:
            flash("Summary is only possible for .txt and .pdf files", "warning")
            return redirect(url_for("files.dashboard"))

        # 🔹 Pošlji AI strežniku
        res = requests.post(AI_SUMMARIZE_API, json={"text": content}, timeout=60)
        res.raise_for_status()
        summary = res.json().get("summary", "[Ni bilo povzetka]")
    except Exception as e:
        summary = f"Error at geneerating a summary: {e}"

    return render_template("files/summary.html", filename=file.original_filename, summary=summary)


@files_bp.route('/stream/<int:file_id>')
@login_required
def stream_video(file_id):
    """Stream video file with HTTP range request support"""
    from flask import Response, make_response
    import re
    
    file = File.query.get_or_404(file_id)
    
    # Check access
    if file.user_id != current_user.id and not current_user.is_admin:
        logger.warning(f"Unauthorized stream attempt: user={current_user.id}, file={file_id}")
        abort(403)
    
    # Validate file path
    if not validate_file_path(file.path):
        logger.error(f"Invalid file path on stream: file={file_id}, path={file.path}")
        abort(404)
    
    if not os.path.exists(file.path):
        logger.error(f"File not found for streaming: file={file_id}, path={file.path}")
        abort(404)
    
    # Check if it's a video file
    video_extensions = {'.mp4', '.webm', '.mkv', '.avi', '.mov', '.m4v', '.ogv'}
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in video_extensions:
        abort(400, description="Not a video file")
    
    file_size = os.path.getsize(file.path)
    
    # Determine MIME type
    mime_types = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mkv': 'video/x-matroska',
        '.avi': 'video/x-msvideo',
        '.mov': 'video/quicktime',
        '.m4v': 'video/x-m4v',
        '.ogv': 'video/ogg'
    }
    content_type = mime_types.get(ext, 'video/mp4')
    
    # Parse Range header
    range_header = request.headers.get('Range')
    
    if range_header:
        # Parse byte range
        match = re.search(r'bytes=(\d+)-(\d*)', range_header)
        if match:
            start = int(match.group(1))
            end = int(match.group(2)) if match.group(2) else file_size - 1
        else:
            start = 0
            end = file_size - 1
    else:
        start = 0
        end = file_size - 1
    
    # Ensure valid range
    if start >= file_size:
        abort(416)  # Range Not Satisfiable
    
    end = min(end, file_size - 1)
    length = end - start + 1
    
    # Chunk size for streaming (1MB)
    chunk_size = current_app.config.get('CHUNK_SIZE', 1024 * 1024)
    
    # Apply download speed limit to video streaming
    _, download_limit = get_user_speed_limits(current_user)
    
    def generate():
        return throttled_range_stream(
            file.path, start, length,
            speed_limit=download_limit,
            chunk_size=chunk_size
        )
    
    # Build response
    response = Response(
        generate(),
        status=206 if range_header else 200,
        mimetype=content_type,
        direct_passthrough=True
    )
    
    response.headers['Content-Range'] = f'bytes {start}-{end}/{file_size}'
    response.headers['Accept-Ranges'] = 'bytes'
    response.headers['Content-Length'] = str(length)
    response.headers['Cache-Control'] = 'no-cache'
    
    logger.debug(f"Streaming video: file={file_id}, range={start}-{end}/{file_size}")
    
    return response


@files_bp.route('/preview/<int:file_id>')
@login_required
def preview_file(file_id):
    """Preview a file (images, videos, documents)"""
    file = File.query.get_or_404(file_id)
    
    # Check access
    if file.user_id != current_user.id and not current_user.is_admin:
        abort(403)
    
    # Validate file path
    if not validate_file_path(file.path) or not os.path.exists(file.path):
        abort(404)
    
    # Determine file type for preview
    ext = os.path.splitext(file.filename)[1].lower()
    
    preview_type = 'unknown'
    if ext in {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'}:
        preview_type = 'image'
    elif ext in {'.mp4', '.webm', '.mkv', '.avi', '.mov', '.m4v', '.ogv'}:
        preview_type = 'video'
    elif ext in {'.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac'}:
        preview_type = 'audio'
    elif ext in {'.pdf'}:
        preview_type = 'pdf'
    elif ext in {'.txt', '.md', '.json', '.xml', '.csv', '.log'}:
        preview_type = 'text'
    
    return render_template('files/preview.html', file=file, preview_type=preview_type)


# ============================================================================
# JSON API ENDPOINTS FOR REACT FRONTEND
# ============================================================================

@files_bp.route('/api/list')
@login_required
def api_file_list():
    """Return JSON list of user's files for React frontend (excludes DELETED files by default)"""
    # Get DELETED tag
    deleted_tag = Tag.query.filter_by(name='DELETED', is_system=True).first()
    
    # Build query
    query = File.query.filter_by(user_id=current_user.id)
    
    # Filter by DELETED tag
    show_deleted = request.args.get('show_deleted', 'false').lower() == 'true'
    if show_deleted:
        if deleted_tag:
            # Show ONLY files with the DELETED tag
            query = query.filter(File.tags.any(Tag.id == deleted_tag.id))
        else:
            # DELETED tag doesn't exist yet — no files can be deleted
            query = query.filter(False)
    else:
        if deleted_tag:
            # Exclude files that have the DELETED tag
            query = query.filter(~File.tags.any(Tag.id == deleted_tag.id))
    
    files = query.order_by(File.uploaded_at.desc()).all()
    
    return jsonify({
        'files': [{
            'id': f.id,
            'filename': f.filename,
            'original_filename': f.original_filename,
            'file_type': f.file_type,
            'file_size': f.file_size,
            'category': f.category,
            'uploaded_at': f.uploaded_at.isoformat() if f.uploaded_at else None,
            'tags': [{'id': t.id, 'name': t.name, 'color': t.color} for t in f.tags]
        } for f in files]
    })


@files_bp.route('/api/tags')
@login_required
def api_tags_list():
    """Return JSON list of user's tags for React frontend (excludes DELETED system tag)"""
    tags = Tag.query.filter(
        (Tag.user_id == current_user.id) | (Tag.is_system == True)
    ).all()
    
    # Filter out DELETED tag from the list
    tags = [t for t in tags if t.name != 'DELETED']
    
    return jsonify({
        'tags': [{
            'id': t.id,
            'name': t.name,
            'color': t.color,
            'is_system': t.is_system
        } for t in tags]
    })

@files_bp.route('/api/storage-info')
@login_required
def api_storage_info():
    """Return user's storage info for React frontend"""
    storage_used = current_user.storage_used or 0
    
    # Always read live quota from Role (not stale User.storage_limit)
    role = current_user.role_obj
    if role:
        storage_limit = role.storage_quota or 0
        # Sync user's cached limit if out of date
        if current_user.storage_limit != role.storage_quota:
            current_user.storage_limit = role.storage_quota
            db.session.commit()
    else:
        storage_limit = current_user.storage_limit or 0
    
    storage_tier = current_user.storage_tier or 'basic'
    
    percentage = 0
    if storage_limit > 0:
        percentage = round((storage_used / storage_limit) * 100, 1)
    
    # Check for warnings
    warning_level = None
    if percentage >= 95:
        warning_level = 'critical'
    elif percentage >= 75:
        warning_level = 'warning'
    
    # Include speed limits from user's role
    upload_limit, download_limit = get_user_speed_limits(current_user)
    
    return jsonify({
        'storage_used': storage_used,
        'storage_limit': storage_limit,
        'storage_tier': storage_tier,
        'percentage': percentage,
        'warning_level': warning_level,
        'upload_speed_limit': upload_limit,
        'download_speed_limit': download_limit
    })

@files_bp.route('/api/request-storage', methods=['POST'])
@login_required
def api_request_storage():
    """Submit a storage upgrade request"""
    from app.models import StorageRequest
    
    # Demo users can't request storage
    if current_user.is_demo:
        return jsonify({'error': 'Demo users cannot request storage upgrades'}), 400
    
    # Check for existing pending request
    existing = StorageRequest.query.filter_by(
        user_id=current_user.id,
        status='pending'
    ).first()
    
    if existing:
        return jsonify({'error': 'You already have a pending storage request'}), 400
    
    reason = request.form.get('reason', '')
    requested_tier = request.form.get('requested_tier', 'plus')
    
    # Calculate requested size based on tier
    STORAGE_TIERS = {
        'basic': 50 * 1024 * 1024 * 1024,
        'plus': 100 * 1024 * 1024 * 1024,
        'pro': 200 * 1024 * 1024 * 1024,
    }
    
    requested_size = STORAGE_TIERS.get(requested_tier, STORAGE_TIERS['plus'])
    
    storage_request = StorageRequest(
        user_id=current_user.id,
        requested_size=requested_size,
        reason=reason,
        status='pending',
        created_at=datetime.utcnow()
    )
    
    db.session.add(storage_request)
    db.session.commit()
    
    return jsonify({'success': True, 'message': 'Storage request submitted successfully'})


# ============================================================================
# FILE PREVIEW API
# ============================================================================

PREVIEW_TYPES = {
    'image': ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'],
    'pdf': ['pdf'],
    'text': ['txt', 'md', 'json', 'log', 'csv', 'xml', 'html', 'css', 'js', 'py', 'yml', 'yaml'],
    'video': ['mp4', 'webm', 'ogg'],
    'audio': ['mp3', 'wav', 'ogg', 'flac']
}

def get_preview_type(filename):
    """Determine preview type from filename"""
    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    for ptype, extensions in PREVIEW_TYPES.items():
        if ext in extensions:
            return ptype
    return None

@files_bp.route('/api/preview/<int:file_id>')
@login_required
def api_file_preview(file_id):
    """Get file preview data - returns preview info without full file"""
    file = File.query.get_or_404(file_id)
    
    if file.user_id != current_user.id and not current_user.is_admin:
        return jsonify({'error': 'Permission denied'}), 403
    
    preview_type = get_preview_type(file.original_filename or file.filename)
    
    return jsonify({
        'id': file.id,
        'filename': file.original_filename or file.filename,
        'file_type': file.file_type,
        'file_size': file.file_size,
        'preview_type': preview_type,
        'can_preview': preview_type is not None
    })

@files_bp.route('/api/preview/<int:file_id>/content')
@login_required
def api_file_preview_content(file_id):
    """Stream file content for preview - permission checked"""
    file = File.query.get_or_404(file_id)
    
    if file.user_id != current_user.id and not current_user.is_admin:
        return jsonify({'error': 'Permission denied'}), 403
    
    if not validate_file_path(file.path) or not os.path.exists(file.path):
        return jsonify({'error': 'File not found'}), 404
    
    preview_type = get_preview_type(file.original_filename or file.filename)
    
    if preview_type == 'text':
        # For text files, return content as JSON (limit to 1MB)
        try:
            file_size = os.path.getsize(file.path)
            if file_size > 1024 * 1024:  # 1MB limit for text preview
                return jsonify({'error': 'File too large for text preview', 'size': file_size}), 413
            
            with open(file.path, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
            return jsonify({'content': content, 'type': 'text'})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    # For images, PDFs, etc - stream the file with speed limiting
    mimetype = mimetypes.guess_type(file.original_filename or file.filename)[0] or 'application/octet-stream'
    _, download_limit = get_user_speed_limits(current_user)
    return make_throttled_inline_response(file.path, mimetype=mimetype, speed_limit=download_limit)


# ============================================================================
# SHARE LINK API
# ============================================================================

@files_bp.route('/api/share/<int:file_id>', methods=['POST'])
@login_required
def api_create_share_link(file_id):
    """Create a shareable link for a file"""
    import secrets
    from werkzeug.security import generate_password_hash
    from app.models import ShareLink
    
    file = File.query.get_or_404(file_id)
    
    if file.user_id != current_user.id:
        return jsonify({'error': 'Permission denied'}), 403
    
    data = request.get_json() or {}
    
    # Parse expiration
    expires_in = data.get('expires_in')  # hours, or None for never
    expires_at = None
    if expires_in:
        from datetime import timedelta
        expires_at = datetime.utcnow() + timedelta(hours=int(expires_in))
    
    # Password protection
    password = data.get('password')
    password_hash = generate_password_hash(password) if password else None
    
    # Generate unique token
    token = secrets.token_urlsafe(32)
    
    share_link = ShareLink(
        file_id=file_id,
        token=token,
        created_by=current_user.id,
        expires_at=expires_at,
        password_hash=password_hash,
        allow_download=data.get('allow_download', True),
        allow_preview=data.get('allow_preview', True)
    )
    
    db.session.add(share_link)
    
    # Log activity
    activity = ActivityLog(
        user_id=current_user.id,
        action='share_create',
        details=f'Created share link for: {file.original_filename}',
        ip_address=get_client_ip(),
        timestamp=datetime.utcnow()
    )
    db.session.add(activity)
    db.session.commit()
    
    return jsonify({
        'share': share_link.to_dict(),
        'url': f'/s/{token}'
    }), 201

@files_bp.route('/api/share/<int:file_id>/links')
@login_required
def api_get_share_links(file_id):
    """Get all share links for a file"""
    from app.models import ShareLink
    
    file = File.query.get_or_404(file_id)
    
    if file.user_id != current_user.id:
        return jsonify({'error': 'Permission denied'}), 403
    
    links = ShareLink.query.filter_by(file_id=file_id).order_by(ShareLink.created_at.desc()).all()
    return jsonify({'links': [link.to_dict() for link in links]})

@files_bp.route('/api/share/revoke/<int:link_id>', methods=['POST'])
@login_required
def api_revoke_share_link(link_id):
    """Revoke a share link"""
    from app.models import ShareLink
    
    link = ShareLink.query.get_or_404(link_id)
    
    if link.created_by != current_user.id and not current_user.is_admin:
        return jsonify({'error': 'Permission denied'}), 403
    
    link.is_revoked = True
    db.session.commit()
    
    return jsonify({'message': 'Link revoked', 'link': link.to_dict()})


# ============================================================================
# FILE VERSIONING API
# ============================================================================

@files_bp.route('/api/versions/<int:file_id>')
@login_required
def api_get_versions(file_id):
    """Get version history for a file"""
    from app.models import FileVersion
    
    file = File.query.get_or_404(file_id)
    if file.user_id != current_user.id and not current_user.is_admin:
        return jsonify({'error': 'Permission denied'}), 403
    
    versions = FileVersion.query.filter_by(file_id=file_id).order_by(FileVersion.version_number.desc()).all()
    
    return jsonify({
        'current': {
            'filename': file.original_filename,
            'file_size': file.file_size,
            'uploaded_at': file.uploaded_at.isoformat() if file.uploaded_at else None
        },
        'versions': [v.to_dict() for v in versions],
        'total_version_size': sum(v.file_size or 0 for v in versions)
    })

@files_bp.route('/api/versions/<int:file_id>/restore/<int:version_id>', methods=['POST'])
@login_required
def api_restore_version(file_id, version_id):
    """Restore a previous version of a file"""
    from app.models import FileVersion
    import shutil
    
    file = File.query.get_or_404(file_id)
    if file.user_id != current_user.id:
        return jsonify({'error': 'Permission denied'}), 403
    
    version = FileVersion.query.filter_by(id=version_id, file_id=file_id).first_or_404()
    
    if not os.path.exists(version.path):
        return jsonify({'error': 'Version file not found'}), 404
    
    # Save current as new version first
    max_version = db.session.query(db.func.max(FileVersion.version_number)).filter_by(file_id=file_id).scalar() or 0
    
    new_version = FileVersion(
        file_id=file_id,
        version_number=max_version + 1,
        filename=file.filename,
        original_filename=file.original_filename,
        file_size=file.file_size,
        path=file.path,
        created_by=current_user.id
    )
    db.session.add(new_version)
    
    # Copy version file to current location
    new_path = file.path + '.restored'
    shutil.copy2(version.path, new_path)
    
    # Update current file
    old_path = file.path
    file.path = new_path
    file.file_size = version.file_size
    file.uploaded_at = datetime.utcnow()
    
    # Update storage
    size_diff = version.file_size - (new_version.file_size or 0)
    current_user.storage_used = (current_user.storage_used or 0) + size_diff
    
    db.session.commit()
    
    # Rename restored file
    os.rename(new_path, old_path)
    file.path = old_path
    db.session.commit()
    
    return jsonify({'message': 'Version restored', 'file_size': file.file_size})

@files_bp.route('/api/versions/<int:file_id>/delete/<int:version_id>', methods=['POST'])
@login_required
def api_delete_version(file_id, version_id):
    """Delete a specific version"""
    from app.models import FileVersion
    
    file = File.query.get_or_404(file_id)
    if file.user_id != current_user.id:
        return jsonify({'error': 'Permission denied'}), 403
    
    version = FileVersion.query.filter_by(id=version_id, file_id=file_id).first_or_404()
    
    # Delete version file
    if os.path.exists(version.path):
        os.remove(version.path)
    
    # Update storage
    current_user.storage_used = max(0, (current_user.storage_used or 0) - (version.file_size or 0))
    
    db.session.delete(version)
    db.session.commit()
    
    return jsonify({'message': 'Version deleted'})
