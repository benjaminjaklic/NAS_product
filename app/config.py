import os
import secrets
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

def test_database_connection(db_url):
    """Test if a database connection can be established"""
    try:
        if 'postgresql' in db_url:
            import psycopg2
            # Parse connection string
            # Format: postgresql://user:password@host:port/dbname
            from urllib.parse import urlparse
            parsed = urlparse(db_url)
            conn = psycopg2.connect(
                host=parsed.hostname,
                port=parsed.port or 5432,
                user=parsed.username,
                password=parsed.password,
                dbname=parsed.path[1:] if parsed.path else 'postgres',
                connect_timeout=3
            )
            conn.close()
            return True
        elif 'mysql' in db_url:
            import pymysql
            from urllib.parse import urlparse
            parsed = urlparse(db_url)
            conn = pymysql.connect(
                host=parsed.hostname,
                port=parsed.port or 3306,
                user=parsed.username,
                password=parsed.password,
                database=parsed.path[1:] if parsed.path else None,
                connect_timeout=3
            )
            conn.close()
            return True
        return True  # SQLite always works
    except Exception as e:
        print(f"⚠ Database connection failed: {e}")
        return False

class Config:
    # Base directory - this is your project root
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    # Security
    SECRET_KEY = os.environ.get('SECRET_KEY') or secrets.token_hex(32)
    
    # Database Configuration
    # Supports: SQLite (default), PostgreSQL, MySQL
    # Set DATABASE_URL environment variable for production databases
    # Examples:
    #   SQLite:     sqlite:///nas.db
    #   PostgreSQL: postgresql://user:password@localhost:5432/nas_system
    #   MySQL:      mysql://user:password@localhost:3306/nas_system
    DATABASE_URL = os.environ.get('DATABASE_URL')
    SQLITE_FALLBACK = 'sqlite:///nas.db'
    
    # Track which database is actually being used
    _active_db = None
    _using_fallback = False
    
    if DATABASE_URL:
        # Fix Heroku-style postgres:// URLs
        if DATABASE_URL.startswith('postgres://'):
            DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)
        
        # Try to connect to the configured database
        if test_database_connection(DATABASE_URL):
            SQLALCHEMY_DATABASE_URI = DATABASE_URL
            _active_db = 'postgresql' if 'postgresql' in DATABASE_URL else 'mysql' if 'mysql' in DATABASE_URL else 'other'
            print(f"✓ Connected to {_active_db.upper()} database")
        else:
            # Fallback to SQLite
            SQLALCHEMY_DATABASE_URI = SQLITE_FALLBACK
            _active_db = 'sqlite'
            _using_fallback = True
            print(f"⚠ {DATABASE_URL.split('@')[1].split('/')[0] if '@' in DATABASE_URL else 'Database'} unavailable - using SQLite fallback")
    else:
        # Default to SQLite
        SQLALCHEMY_DATABASE_URI = SQLITE_FALLBACK
        _active_db = 'sqlite'
        print("✓ Using SQLite database (default)")
    
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,  # Check connection health before use
        'pool_recycle': 300,    # Recycle connections every 5 minutes
    }
    
    # Database type detection
    @staticmethod
    def is_postgresql():
        return 'postgresql' in Config.SQLALCHEMY_DATABASE_URI
    
    @staticmethod
    def is_sqlite():
        return 'sqlite' in Config.SQLALCHEMY_DATABASE_URI
    
    @staticmethod
    def is_using_fallback():
        return Config._using_fallback
    
    @staticmethod
    def get_active_db():
        return Config._active_db
    
    # Email Configuration (override via environment variables)
    MAIL_SERVER = os.environ.get('MAIL_SERVER', 'smtp.gmail.com')
    MAIL_PORT = int(os.environ.get('MAIL_PORT', 587))
    MAIL_USE_TLS = os.environ.get('MAIL_USE_TLS', 'true').lower() == 'true'
    MAIL_USE_SSL = os.environ.get('MAIL_USE_SSL', 'false').lower() == 'true'
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME', '')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD', '')
    MAIL_DEFAULT_SENDER = os.environ.get('MAIL_DEFAULT_SENDER', 'NAS System <noreply@example.com>')
    SECURITY_PASSWORD_SALT = os.environ.get('SECURITY_PASSWORD_SALT') or secrets.token_hex(16)

    # Redis (optional) — used for rate limiting across workers/restarts.
    # When unset, the app falls back to an in-memory limiter automatically.
    REDIS_URL = os.environ.get('REDIS_URL')
    
    # Update / Version Checking
    # GITHUB_REPO should be "owner/repo" (e.g. "myusername/nas-system").
    # Leave blank to disable remote update checks.
    GITHUB_REPO = os.environ.get('GITHUB_REPO', '')
    
    # File Storage Configuration
    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'files')
    MAX_CONTENT_LENGTH = 21474836480  # 20GB for maximum single file size
    
    # Upload Optimization
    UPLOAD_CHUNK_SIZE = 4 * 1024 * 1024  # 4MB upload chunks
    REQUEST_TIMEOUT = 3600  # 1 hour timeout for large uploads
    SERVER_TIMEOUT = 3600   # Server-side timeout

    # Blocked file extensions (potentially dangerous files)
    BLOCKED_EXTENSIONS = {
        'bat', 'exe', 'cmd', 'sh', 'ps1', 'vbs', 'js', 'reg', 'msi', 'com', 
        'scr', 'gadget', 'application', 'msc', 'jar', 'vb', 'vbe', 'jse', 'ws', 
        'wsf', 'wsc', 'wsh', 'ps1xml', 'ps2', 'ps2xml', 'psc1', 'psc2', 'msh', 
        'msh1', 'msh2', 'mshxml', 'msh1xml', 'msh2xml', 'scf', 'lnk', 'inf', 'sys'
    }

    # Categories for file type icons (for UI purposes)
    FILE_CATEGORIES = {
        'document': {'pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'pages', 'epub', 'odf', 
                    'ods', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'odp'},
        'image': {'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 
                 'psd', 'ai', 'raw', 'heic', 'jfif', 'tif'},
        'video': {'mp4', 'avi', 'mkv', 'mov', 'webm', 'flv', 'wmv', 'm4v', 'mpg', 
                 'mpeg', '3gp', 'h264', 'h265', 'rm', 'swf', 'vob'},
        'audio': {'mp3', 'wav', 'ogg', 'flac', 'm4a', 'wma', 'aac', 'mid', 'midi', 
                 'aif', 'aifc', 'aiff', 'au', 'pcm'},
        'archive': {'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'iso', 'dmg', 'pkg', 
                   'deb', 'rpm', 'xz', 'tgz', 'z'},
        'code': {'py', 'java', 'c', 'cpp', 'h', 'hpp', 'html', 'css', 'scss', 'json', 
                'xml', 'yaml', 'yml', 'sql', 'php', 'rb', 'go', 'rs', 'ts', 'jsx', 'tsx'},
        'font': {'ttf', 'otf', 'woff', 'woff2', 'eot'},
        'model': {'obj', 'fbx', '3ds', 'blend', 'stl', 'dae', 'max'},
        'other': {'*'}  # Catch-all for other file types
    }
    
    # Storage Structure
    FOLDER_STRUCTURE = {
        'users': os.path.join(UPLOAD_FOLDER, 'users'),        # User-specific files
        'shared': os.path.join(UPLOAD_FOLDER, 'shared'),      # Shared files
        'system': os.path.join(UPLOAD_FOLDER, 'system'),      # System files
        'tmp': os.path.join(UPLOAD_FOLDER, 'tmp')             # Temporary upload files
    }
    
    # User Storage Settings (override via environment variables)
    DEFAULT_STORAGE_LIMIT = int(os.environ.get('DEFAULT_STORAGE_LIMIT_GB', 50)) * 1024 * 1024 * 1024
    WARNING_THRESHOLD = 0.75  # 75% - Show warning
    CRITICAL_THRESHOLD = 0.90  # 90% - Show critical warning
    
    # Security Headers
    SECURITY_HEADERS = {
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
        'X-XSS-Protection': '1; mode=block'
    }
    
    # Session Configuration
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)
    # Set SESSION_COOKIE_SECURE=true in the environment when serving over HTTPS
    SESSION_COOKIE_SECURE = os.environ.get('SESSION_COOKIE_SECURE', 'false').lower() == 'true'
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'  # 'Lax' works better with mobile browsers
    
    # CSRF Protection
    WTF_CSRF_ENABLED = True
    WTF_CSRF_SECRET_KEY = os.environ.get('WTF_CSRF_SECRET_KEY') or secrets.token_hex(32)
    WTF_CSRF_TIME_LIMIT = None  # Disable CSRF token expiration for mobile compatibility

    # Logging Configuration
    LOG_FOLDER = os.path.join(BASE_DIR, 'logs')
    LOG_FILENAME = 'nas.log'
    LOG_MAX_SIZE = 10 * 1024 * 1024  # 10MB
    LOG_BACKUP_COUNT = 5

    # Video Streaming
    CHUNK_SIZE = 1024 * 1024  # 1MB chunks for video streaming
    
    # Preview Settings
    MAX_PREVIEW_SIZE = 10 * 1024 * 1024  # 10MB max for preview
    THUMBNAIL_SIZE = (200, 200)  # Thumbnail dimensions
    
    # Performance Settings for Raspberry Pi
    MAX_WORKERS = 2  # Limit number of worker processes
    THREAD_POOL_SIZE = 8  # Thread pool size for async operations
    
    # Print storage path on startup for verification
    print(f"Storage path is set to: {UPLOAD_FOLDER}")
    
    @staticmethod
    def init_directories():
        """Initialize base directory structure"""
        # Create main storage directories
        for folder in Config.FOLDER_STRUCTURE.values():
            os.makedirs(folder, exist_ok=True)
            print(f"Created/verified directory at: {folder}")
        
        # Create logs directory
        os.makedirs(Config.LOG_FOLDER, exist_ok=True)
        print(f"Created/verified logs directory at: {Config.LOG_FOLDER}")
        
        # Create temp directory with appropriate permissions
        temp_dir = os.path.join(Config.UPLOAD_FOLDER, 'tmp')
        os.makedirs(temp_dir, exist_ok=True)
        os.chmod(temp_dir, 0o750)  # Restrictive permissions for temporary storage
        print(f"Created/verified temp directory at: {temp_dir}")

    @staticmethod
    def get_user_storage_path(user_id):
        """Get the storage path for a specific user"""
        user_path = os.path.join(Config.FOLDER_STRUCTURE['users'], str(user_id))
        os.makedirs(user_path, exist_ok=True)
        return user_path

    @staticmethod
    def get_file_category(filename):
        """Determine file category based on extension"""
        ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
        for category, extensions in Config.FILE_CATEGORIES.items():
            if ext in extensions:
                return category
        return 'other'

    @staticmethod
    def format_size(size_in_bytes):
        """Format file size in human-readable format"""
        for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
            if size_in_bytes < 1024:
                return f"{size_in_bytes:.2f} {unit}"
            size_in_bytes /= 1024
        return f"{size_in_bytes:.2f} PB"