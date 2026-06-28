"""API routes for React frontend"""
from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from app.models import db, Note
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

api_bp = Blueprint('api', __name__, url_prefix='/api')


# Notes API
@api_bp.route('/notes', methods=['GET'])
@login_required
def get_notes():
    """Get all notes for current user"""
    notes = Note.query.filter_by(user_id=current_user.id).order_by(Note.updated_at.desc()).all()
    return jsonify({'notes': [note.to_dict() for note in notes]})


@api_bp.route('/notes', methods=['POST'])
@login_required
def create_note():
    """Create a new note"""
    data = request.get_json() or {}
    
    note = Note(
        user_id=current_user.id,
        title=data.get('title', 'New Note'),
        content=data.get('content', '')
    )
    
    db.session.add(note)
    db.session.commit()
    
    logger.info(f"Note created: user={current_user.id}, note_id={note.id}")
    return jsonify({'note': note.to_dict()}), 201


@api_bp.route('/notes/<int:note_id>', methods=['GET'])
@login_required
def get_note(note_id):
    """Get a specific note"""
    note = Note.query.filter_by(id=note_id, user_id=current_user.id).first_or_404()
    return jsonify({'note': note.to_dict()})


@api_bp.route('/notes/<int:note_id>', methods=['PUT'])
@login_required
def update_note(note_id):
    """Update a note"""
    note = Note.query.filter_by(id=note_id, user_id=current_user.id).first_or_404()
    
    data = request.get_json() or {}
    
    if 'title' in data:
        note.title = data['title']
    if 'content' in data:
        note.content = data['content']
    if 'color' in data:
        note.color = data['color']
    if 'category' in data:
        note.category = data['category']
    if 'is_pinned' in data:
        note.is_pinned = data['is_pinned']
    
    note.updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({'note': note.to_dict()})


@api_bp.route('/notes/<int:note_id>', methods=['DELETE'])
@login_required
def delete_note(note_id):
    """Delete a note"""
    note = Note.query.filter_by(id=note_id, user_id=current_user.id).first_or_404()
    
    db.session.delete(note)
    db.session.commit()
    
    logger.info(f"Note deleted: user={current_user.id}, note_id={note_id}")
    return jsonify({'message': 'Note deleted'})
