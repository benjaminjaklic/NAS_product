from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
import bcrypt
import os
from datetime import datetime
from app import db
import logging
import sqlite3
from flask import current_app

# File Tags association table (many-to-many)
file_tags = db.Table('file_tags',
    db.Column('file_id', db.Integer, db.ForeignKey('file.id'), primary_key=True),
    db.Column('tag_id', db.Integer, db.ForeignKey('tag.id'), primary_key=True)
)


class Role(db.Model):
    """Custom roles with storage quotas"""
    __tablename__ = 'role'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)
    display_name = db.Column(db.String(100))
    storage_quota = db.Column(db.BigInteger, default=10 * 1024 * 1024 * 1024)  # 10GB default
    is_system = db.Column(db.Boolean, default=False)  # System roles can't be deleted
    is_admin = db.Column(db.Boolean, default=False)  # Role grants admin privileges
    color = db.Column(db.String(20), default='#6c757d')
    description = db.Column(db.String(500))
    upload_speed_limit = db.Column(db.BigInteger, default=0)    # bytes/sec, 0 = unlimited
    download_speed_limit = db.Column(db.BigInteger, default=0)  # bytes/sec, 0 = unlimited
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationship to users
    users = db.relationship('User', back_populates='role_obj', lazy='dynamic')
    
    def __repr__(self):
        return f'<Role {self.name}>'
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'display_name': self.display_name or self.name.title(),
            'storage_quota': self.storage_quota,
            'is_system': self.is_system,
            'is_admin': self.is_admin,
            'color': self.color,
            'description': self.description,
            'upload_speed_limit': self.upload_speed_limit or 0,
            'download_speed_limit': self.download_speed_limit or 0,
            'user_count': self.users.count()
        }


def initialize_default_roles():
    """Create default system roles"""
    try:
        default_roles = [
            {'name': 'admin', 'display_name': 'Administrator', 'storage_quota': 100 * 1024 * 1024 * 1024, 'is_system': True, 'is_admin': True, 'color': '#dc3545', 'description': 'Full system access'},
            {'name': 'boss', 'display_name': 'Manager', 'storage_quota': 50 * 1024 * 1024 * 1024, 'is_system': True, 'is_admin': False, 'color': '#fd7e14', 'description': 'Department manager'},
            {'name': 'it', 'display_name': 'IT Staff', 'storage_quota': 50 * 1024 * 1024 * 1024, 'is_system': True, 'is_admin': False, 'color': '#0dcaf0', 'description': 'IT department'},
            {'name': 'user', 'display_name': 'User', 'storage_quota': 10 * 1024 * 1024 * 1024, 'is_system': True, 'is_admin': False, 'color': '#6c757d', 'description': 'Standard user'},
            {'name': 'demo', 'display_name': 'Demo', 'storage_quota': 1 * 1024 * 1024 * 1024, 'is_system': True, 'is_admin': False, 'color': '#6610f2', 'description': 'Demo account with limited access'},
        ]
        
        for role_info in default_roles:
            role = Role.query.filter_by(name=role_info['name']).first()
            if not role:
                role = Role(**role_info)
                db.session.add(role)
                print(f"Created role: {role_info['name']}")
        
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"Error initializing roles: {str(e)}")


class User(UserMixin, db.Model):
    __tablename__ = 'user'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256))
    
    # Storage
    storage_limit = db.Column(db.BigInteger)
    storage_used = db.Column(db.BigInteger)
    storage_tier = db.Column(db.String(20), default='basic')  # demo, basic, plus, pro
    
    # Status
    is_admin = db.Column(db.Boolean)
    is_approved = db.Column(db.Boolean)
    is_demo = db.Column(db.Boolean, default=False)
    is_verified = db.Column(db.Boolean, default=False)

    # Email verification
    confirmation_token = db.Column(db.String(256))
    token_created_at = db.Column(db.DateTime)
    role = db.Column(db.String(50), default='user')  # Legacy field, use role_id instead
    role_id = db.Column(db.Integer, db.ForeignKey('role.id'), nullable=True)
    
    # Relationship to Role
    role_obj = db.relationship('Role', back_populates='users')
    
    # Timestamps
    last_login = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime)
    
    # Relationships - defined here, back_populates on other models
    files = db.relationship('File', back_populates='user', lazy='dynamic')
    created_groups = db.relationship('Group', back_populates='creator', lazy='dynamic', foreign_keys='Group.creator_id')
    tags = db.relationship('Tag', back_populates='creator', lazy='dynamic')
    activities = db.relationship('ActivityLog', back_populates='user', lazy='dynamic')
    notifications = db.relationship('Notification', back_populates='user', lazy='dynamic')
    group_memberships = db.relationship('UserGroups', back_populates='user', lazy='dynamic')
    storage_requests = db.relationship('StorageRequest', back_populates='user', foreign_keys='StorageRequest.user_id', lazy='dynamic')
    
    def __repr__(self):
        return f'<User {self.username}>'
    
    def set_password(self, password):
        """Hash password using bcrypt (industry standard, GPU-resistant)"""
        salt = bcrypt.gensalt(rounds=12)
        self.password_hash = bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
    
    def check_password(self, password):
        """Verify password — supports bcrypt and legacy pbkdf2 hashes.
        Automatically rehashes to bcrypt on successful legacy login."""
        if not self.password_hash:
            return False
        # Legacy pbkdf2 hash (from Werkzeug)
        if self.password_hash.startswith('pbkdf2:'):
            if check_password_hash(self.password_hash, password):
                # Auto-upgrade to bcrypt on successful login
                self.set_password(password)
                return True
            return False
        # bcrypt hash
        try:
            return bcrypt.checkpw(password.encode('utf-8'), self.password_hash.encode('utf-8'))
        except (ValueError, TypeError):
            return False
    
    def get_storage_percentage(self):
        if not self.storage_limit or self.storage_limit == 0:
            return 100
        return (self.storage_used / self.storage_limit) * 100
    
    def get_storage_usage(self, exclude_deleted=True):
        """Get storage used by user, optionally excluding deleted files"""
        if exclude_deleted:
            # Calculate storage excluding files with DELETED tag
            deleted_tag = Tag.query.filter_by(name='DELETED', is_system=True).first()
            if deleted_tag:
                # Get total size of non-deleted files
                from sqlalchemy import func
                result = db.session.query(func.sum(File.file_size)).filter(
                    File.user_id == self.id,
                    ~File.tags.any(Tag.id == deleted_tag.id)
                ).scalar()
                return result or 0
        return self.storage_used or 0
    
    def can_upload(self, file_size):
        if not self.storage_limit:
            return True
        return self.storage_used + file_size <= self.storage_limit



class UserGroups(db.Model):
    """Association table for User-Group many-to-many with extra data"""
    __tablename__ = 'user_groups'
    
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete="CASCADE"), primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey('group.id', ondelete="CASCADE"), primary_key=True)
    is_admin = db.Column(db.Boolean, default=False)

    # Relationships with back_populates
    user = db.relationship('User', back_populates='group_memberships')
    group = db.relationship('Group', back_populates='user_memberships')

    def __repr__(self):
        return f'<UserGroups {self.user_id} in {self.group_id}>'


class Tag(db.Model):
    __tablename__ = 'tag'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    color = db.Column(db.String(20), default='#6c757d')
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    is_system = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationship
    creator = db.relationship('User', back_populates='tags')
    
    def __repr__(self):
        return f'<Tag {self.name}>'


class File(db.Model):
    __tablename__ = 'file'
    
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    original_filename = db.Column(db.String(255), nullable=False)
    file_type = db.Column(db.String(50))
    file_size = db.Column(db.BigInteger)
    category = db.Column(db.String(50))
    path = db.Column(db.String(512), nullable=False, unique=True)
    is_public = db.Column(db.Boolean)
    
    # Timestamps
    uploaded_at = db.Column(db.DateTime)
    last_accessed = db.Column(db.DateTime)
    
    # Foreign keys
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    group_id = db.Column(db.Integer, db.ForeignKey('group.id', ondelete='SET NULL'))
    
    # Relationships
    user = db.relationship('User', back_populates='files')
    group = db.relationship('Group', back_populates='files')
    tags = db.relationship('Tag', secondary=file_tags, backref=db.backref('files', lazy='dynamic'))
    
    # Compatibility properties
    @property
    def filepath(self):
        return self.path
    
    @filepath.setter
    def filepath(self, value):
        self.path = value
        
    @property
    def filetype(self):
        return self.file_type
    
    @filetype.setter
    def filetype(self, value):
        self.file_type = value
        
    @property
    def filesize(self):
        return self.file_size
    
    @filesize.setter
    def filesize(self, value):
        self.file_size = value
    
    def __repr__(self):
        return f'<File {self.filename}>'
    
    def update_last_accessed(self):
        """Update the last accessed timestamp"""
        self.last_accessed = datetime.utcnow()
        db.session.commit()
    
    def is_archive(self):
        """Check if the file is an archive file (zip, rar, etc.)"""
        return self.filename.lower().endswith(('.zip', '.rar', '.7z', '.tar.gz', '.tar'))


class Group(db.Model):
    __tablename__ = 'group'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(64), unique=True, nullable=False)
    description = db.Column(db.String(256))
    created_at = db.Column(db.DateTime)
    creator_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    
    # Relationships
    creator = db.relationship('User', back_populates='created_groups')
    files = db.relationship('File', back_populates='group', lazy='dynamic')
    user_memberships = db.relationship('UserGroups', back_populates='group', lazy='dynamic')
    
    def __repr__(self):
        return f'<Group {self.name}>'
    
    def is_member(self, user_id):
        """Check if a user is a member of this group"""
        return UserGroups.query.filter_by(group_id=self.id, user_id=user_id).first() is not None
    
    def is_admin(self, user_id):
        """Check if a user is an admin of this group"""
        user_group = UserGroups.query.filter_by(group_id=self.id, user_id=user_id).first()
        return user_group is not None and user_group.is_admin


class ActivityLog(db.Model):
    __tablename__ = 'activity_log'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    action = db.Column(db.String(50), nullable=False)
    details = db.Column(db.Text)
    ip_address = db.Column(db.String(50))
    timestamp = db.Column(db.DateTime)
    
    # Relationship
    user = db.relationship('User', back_populates='activities')
    
    def __repr__(self):
        return f'<ActivityLog {self.action} by {self.user_id}>'


class StorageRequest(db.Model):
    __tablename__ = 'storage_request'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    requested_size = db.Column(db.BigInteger, nullable=False)
    reason = db.Column(db.Text)
    status = db.Column(db.String(20))
    created_at = db.Column(db.DateTime)
    responded_at = db.Column(db.DateTime)
    responded_by = db.Column(db.Integer, db.ForeignKey('user.id'))
    
    # Relationships
    user = db.relationship('User', back_populates='storage_requests', foreign_keys=[user_id])
    responder = db.relationship('User', backref='handled_requests', foreign_keys=[responded_by])
    
    def __repr__(self):
        return f'<StorageRequest by {self.user_id} for {self.requested_size} bytes>'


class Notification(db.Model):
    __tablename__ = 'notification'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    message = db.Column(db.String(500), nullable=False)
    type = db.Column(db.String(50))
    read = db.Column(db.Boolean)
    created_at = db.Column(db.DateTime)
    
    # Relationship
    user = db.relationship('User', back_populates='notifications')
    
    def __repr__(self):
        return f'<Notification for {self.user_id}>'


class UserTheme(db.Model):
    """User-customizable theme settings stored in database"""
    __tablename__ = 'user_theme'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False, unique=True)
    
    # Theme name for identification
    name = db.Column(db.String(50), default='Custom')
    
    # Base theme mode
    mode = db.Column(db.String(10), default='light')  # 'light' or 'dark'
    
    # Primary colors
    color_primary = db.Column(db.String(20), default='#4f46e5')
    color_primary_hover = db.Column(db.String(20), default='#4338ca')
    
    # Accent colors
    color_success = db.Column(db.String(20), default='#10b981')
    color_warning = db.Column(db.String(20), default='#f59e0b')
    color_danger = db.Column(db.String(20), default='#ef4444')
    
    # Background colors
    bg_body = db.Column(db.String(20), default='#f8fafc')
    bg_card = db.Column(db.String(20), default='#ffffff')
    bg_nav = db.Column(db.String(20), default='#ffffff')
    
    # Text colors
    text_primary = db.Column(db.String(20), default='#0f172a')
    text_secondary = db.Column(db.String(20), default='#475569')
    
    # Border and shadow
    border_color = db.Column(db.String(20), default='#e2e8f0')
    border_radius = db.Column(db.String(10), default='0.375rem')
    
    # Font settings
    font_family = db.Column(db.String(100), default='system-ui, -apple-system, sans-serif')
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationship - cascade delete when user is deleted
    user = db.relationship('User', backref=db.backref('theme', uselist=False, cascade='all, delete-orphan'))
    
    def __repr__(self):
        return f'<UserTheme {self.name} for user {self.user_id}>'
    
    def to_css_variables(self):
        """Convert theme settings to CSS custom properties"""
        variables = {
            '--color-primary': self.color_primary,
            '--color-primary-hover': self.color_primary_hover,
            '--color-success': self.color_success,
            '--color-warning': self.color_warning,
            '--color-danger': self.color_danger,
            '--bg-body': self.bg_body,
            '--bg-card': self.bg_card,
            '--bg-nav': self.bg_nav,
            '--text-primary': self.text_primary,
            '--text-secondary': self.text_secondary,
            '--border-color': self.border_color,
            '--radius': self.border_radius,
        }
        return variables
    
    def to_css_string(self):
        """Generate inline CSS style string"""
        variables = self.to_css_variables()
        css_parts = [f'{key}: {value}' for key, value in variables.items()]
        return '; '.join(css_parts)
    
    @staticmethod
    def get_default_theme():
        """Return default theme values"""
        return {
            'mode': 'light',
            'color_primary': '#4f46e5',
            'color_primary_hover': '#4338ca',
            'color_success': '#10b981',
            'color_warning': '#f59e0b',
            'color_danger': '#ef4444',
            'bg_body': '#f8fafc',
            'bg_card': '#ffffff',
            'bg_nav': '#ffffff',
            'text_primary': '#0f172a',
            'text_secondary': '#475569',
            'border_color': '#e2e8f0',
            'border_radius': '0.375rem',
            'font_family': 'system-ui, -apple-system, sans-serif'
        }
    
    @staticmethod
    def get_dark_defaults():
        """Return dark theme default values"""
        return {
            'mode': 'dark',
            'color_primary': '#6366f1',
            'color_primary_hover': '#4f46e5',
            'color_success': '#10b981',
            'color_warning': '#f59e0b',
            'color_danger': '#ef4444',
            'bg_body': '#0f172a',
            'bg_card': '#1e293b',
            'bg_nav': '#1e293b',
            'text_primary': '#f1f5f9',
            'text_secondary': '#cbd5e1',
            'border_color': '#334155',
            'border_radius': '0.375rem',
            'font_family': 'system-ui, -apple-system, sans-serif'
        }


def check_and_update_tables():
    """Check and update database tables if needed
    This function is called during app initialization to ensure all tables exist and
    have the required columns.
    """
    import logging
    import sqlite3
    
    try:
        db_uri = current_app.config['SQLALCHEMY_DATABASE_URI']
        
        # Only run SQLite-specific migrations for SQLite databases
        if 'sqlite' not in db_uri:
            logging.info("Non-SQLite database detected, skipping SQLite migration checks")
            return
        
        # Get database path from current app context
        # Flask-SQLAlchemy resolves relative sqlite:/// paths to the instance folder
        db_path = db_uri.replace('sqlite:///', '')
        if not os.path.isabs(db_path):
            db_path = os.path.join(current_app.instance_path, db_path)
        
        # Connect to database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Log tables found
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        table_names = [table[0] for table in tables]
        logging.info(f"Database tables: {table_names}")
        
        # Check if user table exists first
        if 'user' not in table_names:
            logging.info("User table doesn't exist yet, skipping migration")
            conn.close()
            return
        
        # Create role table if it doesn't exist
        if 'role' not in table_names:
            cursor.execute('''
                CREATE TABLE role (
                    id INTEGER PRIMARY KEY,
                    name VARCHAR(50) UNIQUE NOT NULL,
                    display_name VARCHAR(100),
                    storage_quota BIGINT DEFAULT 10737418240,
                    is_system BOOLEAN DEFAULT 0,
                    is_admin BOOLEAN DEFAULT 0,
                    color VARCHAR(20) DEFAULT '#6c757d',
                    description VARCHAR(500),
                    upload_speed_limit BIGINT DEFAULT 0,
                    download_speed_limit BIGINT DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            conn.commit()
            logging.info("Created role table")
        
        # Check if user table has role_id column
        cursor.execute("PRAGMA table_info(user);")
        user_columns = [col[1] for col in cursor.fetchall()]
        
        if 'role_id' not in user_columns:
            cursor.execute('ALTER TABLE user ADD COLUMN role_id INTEGER REFERENCES role(id)')
            conn.commit()
            logging.info("Added role_id column to user table")

        # Email-verification related columns
        if 'is_verified' not in user_columns:
            cursor.execute('ALTER TABLE user ADD COLUMN is_verified BOOLEAN DEFAULT 0')
            conn.commit()
            logging.info("Added is_verified column to user table")
        if 'confirmation_token' not in user_columns:
            cursor.execute('ALTER TABLE user ADD COLUMN confirmation_token VARCHAR(256)')
            conn.commit()
            logging.info("Added confirmation_token column to user table")
        if 'token_created_at' not in user_columns:
            cursor.execute('ALTER TABLE user ADD COLUMN token_created_at DATETIME')
            conn.commit()
            logging.info("Added token_created_at column to user table")
        
        # Add speed limit columns to role table if missing
        # Re-check table_names in case the role table was just created above
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        table_names = [t[0] for t in cursor.fetchall()]
        if 'role' in table_names:
            cursor.execute("PRAGMA table_info(role);")
            role_columns = [col[1] for col in cursor.fetchall()]
            
            if 'upload_speed_limit' not in role_columns:
                cursor.execute('ALTER TABLE role ADD COLUMN upload_speed_limit BIGINT DEFAULT 0')
                conn.commit()
                logging.info("Added upload_speed_limit column to role table")
            
            if 'download_speed_limit' not in role_columns:
                cursor.execute('ALTER TABLE role ADD COLUMN download_speed_limit BIGINT DEFAULT 0')
                conn.commit()
                logging.info("Added download_speed_limit column to role table")
        
        conn.close()
        logging.info("Database structure check completed")
        
    except Exception as e:
        logging.error(f"Error checking database structure: {str(e)}")


def initialize_system_tags():
    """Create system tags if they don't exist"""
    try:
        # Check for FOLDER tag
        folder_tag = Tag.query.filter_by(name='FOLDER', is_system=True).first()
        if not folder_tag:
            folder_tag = Tag(name='FOLDER', color='#ffc107', is_system=True)
            db.session.add(folder_tag)
            print("Created system tag: FOLDER")
        
        # Create other system tags as needed
        system_tags = [
            {'name': 'IMPORTANT', 'color': '#dc3545'},
            {'name': 'WORK', 'color': '#0d6efd'},
            {'name': 'PERSONAL', 'color': '#198754'}
        ]
        
        for tag_info in system_tags:
            tag = Tag.query.filter_by(name=tag_info['name'], is_system=True).first()
            if not tag:
                tag = Tag(name=tag_info['name'], color=tag_info['color'], is_system=True)
                db.session.add(tag)
                print(f"Created system tag: {tag_info['name']}")
        
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"Error initializing system tags: {str(e)}")


class Note(db.Model):
    """User notes with autosave support"""
    __tablename__ = 'note'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    title = db.Column(db.String(200), default='Untitled')
    content = db.Column(db.Text, default='')
    color = db.Column(db.String(20), default='#6c757d')
    category = db.Column(db.String(50), default='other')
    is_pinned = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = db.relationship('User', backref=db.backref('notes', lazy='dynamic'))
    
    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'content': self.content,
            'color': self.color,
            'category': self.category,
            'is_pinned': self.is_pinned,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class ShareLink(db.Model):
    """Shareable file links with expiration and optional password"""
    __tablename__ = 'share_link'
    
    id = db.Column(db.Integer, primary_key=True)
    file_id = db.Column(db.Integer, db.ForeignKey('file.id'), nullable=False)
    token = db.Column(db.String(64), unique=True, nullable=False, index=True)
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=True)
    password_hash = db.Column(db.String(128), nullable=True)
    allow_download = db.Column(db.Boolean, default=True)
    allow_preview = db.Column(db.Boolean, default=True)
    one_time_download = db.Column(db.Boolean, default=False)
    max_downloads = db.Column(db.Integer, nullable=True)
    download_count = db.Column(db.Integer, default=0)
    access_count = db.Column(db.Integer, default=0)
    last_accessed = db.Column(db.DateTime, nullable=True)
    is_revoked = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    file = db.relationship('File', backref=db.backref('share_links', lazy='dynamic'))
    creator = db.relationship('User', backref=db.backref('created_shares', lazy='dynamic'))
    
    def is_valid(self):
        if self.is_revoked:
            return False
        if self.expires_at and datetime.utcnow() > self.expires_at:
            return False
        return True
    
    def check_password(self, password):
        if not self.password_hash:
            return True
        from werkzeug.security import check_password_hash
        return check_password_hash(self.password_hash, password)
    
    def to_dict(self):
        return {
            'id': self.id,
            'token': self.token,
            'file_id': self.file_id,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'has_password': bool(self.password_hash),
            'allow_download': self.allow_download,
            'allow_preview': self.allow_preview,
            'access_count': self.access_count,
            'is_revoked': self.is_revoked,
            'is_valid': self.is_valid(),
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class FileVersion(db.Model):
    """Track file versions for version history"""
    __tablename__ = 'file_version'
    
    id = db.Column(db.Integer, primary_key=True)
    file_id = db.Column(db.Integer, db.ForeignKey('file.id'), nullable=False)
    version_number = db.Column(db.Integer, nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    original_filename = db.Column(db.String(255))
    file_size = db.Column(db.BigInteger)
    path = db.Column(db.String(500), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    created_by = db.Column(db.Integer, db.ForeignKey('user.id'))
    
    file = db.relationship('File', backref=db.backref('versions', lazy='dynamic'))
    creator = db.relationship('User', backref='file_versions')
    
    def to_dict(self):
        return {
            'id': self.id,
            'version_number': self.version_number,
            'original_filename': self.original_filename,
            'file_size': self.file_size,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class SystemConfig(db.Model):
    """System-wide configuration stored in database"""
    __tablename__ = 'system_config'
    
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100), unique=True, nullable=False, index=True)
    value = db.Column(db.Text)
    value_type = db.Column(db.String(20), default='string')
    category = db.Column(db.String(50), default='general')
    description = db.Column(db.String(500))
    is_sensitive = db.Column(db.Boolean, default=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = db.Column(db.Integer, db.ForeignKey('user.id'))
    
    @staticmethod
    def get(key, default=None):
        """Get a config value by key"""
        config = SystemConfig.query.filter_by(key=key).first()
        if not config:
            return default
        if config.value_type == 'int':
            return int(config.value) if config.value else default
        elif config.value_type == 'bool':
            return config.value.lower() in ('true', '1', 'yes') if config.value else default
        elif config.value_type == 'json':
            import json
            return json.loads(config.value) if config.value else default
        return config.value
    
    @staticmethod
    def set(key, value, value_type='string', category='general', description=None, is_sensitive=False, updated_by=None):
        """Set a config value"""
        import json
        config = SystemConfig.query.filter_by(key=key).first()
        if value_type == 'json':
            value = json.dumps(value)
        elif value_type == 'bool':
            value = 'true' if value else 'false'
        else:
            value = str(value) if value is not None else None
        
        if config:
            config.value = value
            config.value_type = value_type
            if description:
                config.description = description
            config.updated_by = updated_by
        else:
            config = SystemConfig(
                key=key, value=value, value_type=value_type, category=category,
                description=description, is_sensitive=is_sensitive, updated_by=updated_by
            )
            db.session.add(config)
        db.session.commit()
        return config
    
    @staticmethod
    def is_setup_complete():
        """Check if initial setup has been completed"""
        return SystemConfig.get('setup_complete', False)

    def to_dict(self, include_sensitive=False):
        """Serialize a config entry. Sensitive values are hidden unless
        explicitly requested by an authorized caller."""
        if self.is_sensitive and not include_sensitive:
            value = '[HIDDEN]'
        else:
            value = self.value
        return {
            'key': self.key,
            'value': value,
            'value_type': self.value_type,
            'category': self.category,
            'description': self.description,
            'is_sensitive': self.is_sensitive,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class TrashedFile(db.Model):
    """Soft-deleted files that can be restored within 30 days"""
    __tablename__ = 'trashed_file'
    
    id = db.Column(db.Integer, primary_key=True)
    original_file_id = db.Column(db.Integer, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    filename = db.Column(db.String(255), nullable=False)
    original_filename = db.Column(db.String(255), nullable=False)
    file_type = db.Column(db.String(50))
    file_size = db.Column(db.BigInteger)
    category = db.Column(db.String(50))
    path = db.Column(db.String(512), nullable=False)
    original_path = db.Column(db.String(512), nullable=False)
    deleted_at = db.Column(db.DateTime, default=datetime.utcnow)
    expires_at = db.Column(db.DateTime, nullable=False)
    
    user = db.relationship('User', backref=db.backref('trashed_files', lazy='dynamic'))
    
    def is_expired(self):
        return datetime.utcnow() > self.expires_at
    
    def days_until_permanent_delete(self):
        if self.is_expired():
            return 0
        delta = self.expires_at - datetime.utcnow()
        return max(0, delta.days)
    
    def to_dict(self):
        return {
            'id': self.id,
            'original_filename': self.original_filename,
            'file_type': self.file_type,
            'file_size': self.file_size,
            'category': self.category,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'days_remaining': self.days_until_permanent_delete()
        }