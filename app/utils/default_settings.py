"""
Default system settings with descriptions
"""

DEFAULT_SETTINGS = {
    'general': {
        'app_name': {
            'value': 'NAS System',
            'value_type': 'string',
            'description': 'Application name displayed in UI',
            'is_sensitive': False
        },
        'app_port': {
            'value': '5000',
            'value_type': 'int',
            'description': 'Port number for the application',
            'is_sensitive': False
        },
        'demo_enabled': {
            'value': 'false',
            'value_type': 'bool',
            'description': 'Enable demo account with auto-cleanup',
            'is_sensitive': False
        },
        'demo_cleanup_hours': {
            'value': '24',
            'value_type': 'int',
            'description': 'Hours before demo files are auto-deleted',
            'is_sensitive': False
        }
    },
    'storage': {
        'file_storage_path': {
            'value': 'files',
            'value_type': 'string',
            'description': 'Directory path for file storage',
            'is_sensitive': False
        },
        'database_path': {
            'value': 'instance/nas.db',
            'value_type': 'string',
            'description': 'SQLite database file path',
            'is_sensitive': False
        },
        'trash_retention_days': {
            'value': '30',
            'value_type': 'int',
            'description': 'Days before permanently deleting trashed files',
            'is_sensitive': False
        },
        'max_upload_size_gb': {
            'value': '20',
            'value_type': 'int',
            'description': 'Maximum file upload size in GB',
            'is_sensitive': False
        },
        'role_quota_admin': {
            'value': '100',
            'value_type': 'int',
            'description': 'Storage quota for Admin role (GB)',
            'is_sensitive': False
        },
        'role_quota_it': {
            'value': '50',
            'value_type': 'int',
            'description': 'Storage quota for IT role (GB)',
            'is_sensitive': False
        },
        'role_quota_boss': {
            'value': '75',
            'value_type': 'int',
            'description': 'Storage quota for Boss role (GB)',
            'is_sensitive': False
        },
        'role_quota_user': {
            'value': '10',
            'value_type': 'int',
            'description': 'Storage quota for User role (GB)',
            'is_sensitive': False
        }
    },
    'email': {
        'email_enabled': {
            'value': 'false',
            'value_type': 'bool',
            'description': 'Enable email functionality',
            'is_sensitive': False
        },
        'email_server': {
            'value': 'smtp.gmail.com',
            'value_type': 'string',
            'description': 'SMTP server hostname (e.g., smtp.gmail.com, smtp.office365.com)',
            'is_sensitive': False
        },
        'email_port': {
            'value': '587',
            'value_type': 'int',
            'description': 'SMTP server port (587 for TLS, 465 for SSL)',
            'is_sensitive': False
        },
        'email_username': {
            'value': '',
            'value_type': 'string',
            'description': 'SMTP username (usually your email address)',
            'is_sensitive': False
        },
        'email_password': {
            'value': '',
            'value_type': 'string',
            'description': 'SMTP password or app-specific password',
            'is_sensitive': True
        },
        'email_sender_name': {
            'value': 'NAS System',
            'value_type': 'string',
            'description': 'Display name for sent emails',
            'is_sensitive': False
        },
        'email_sender_address': {
            'value': '',
            'value_type': 'string',
            'description': 'From email address',
            'is_sensitive': False
        },
        'email_use_tls': {
            'value': 'true',
            'value_type': 'bool',
            'description': 'Use TLS encryption (recommended)',
            'is_sensitive': False
        },
        'email_use_ssl': {
            'value': 'false',
            'value_type': 'bool',
            'description': 'Use SSL encryption',
            'is_sensitive': False
        },
        'email_verification_mode': {
            'value': 'none',
            'value_type': 'string',
            'description': 'Email verification: none, optional, required',
            'is_sensitive': False
        },
        'email_login_notifications': {
            'value': 'false',
            'value_type': 'bool',
            'description': 'Send email on each login',
            'is_sensitive': False
        },
        'email_admin_approval': {
            'value': 'true',
            'value_type': 'bool',
            'description': 'Require admin approval for new accounts',
            'is_sensitive': False
        }
    },
    'security': {
        'allow_registration': {
            'value': 'true',
            'value_type': 'bool',
            'description': 'Allow new user registration',
            'is_sensitive': False
        },
        'require_admin_approval': {
            'value': 'true',
            'value_type': 'bool',
            'description': 'New users require admin approval',
            'is_sensitive': False
        },
        'session_timeout_minutes': {
            'value': '120',
            'value_type': 'int',
            'description': 'Session timeout in minutes (OWASP recommends 15-120)',
            'is_sensitive': False
        },
        'max_login_attempts': {
            'value': '5',
            'value_type': 'int',
            'description': 'Max failed login attempts before lockout',
            'is_sensitive': False
        },
        'lockout_duration_minutes': {
            'value': '15',
            'value_type': 'int',
            'description': 'Account lockout duration after failed attempts',
            'is_sensitive': False
        },
        'password_min_length': {
            'value': '8',
            'value_type': 'int',
            'description': 'Minimum password length',
            'is_sensitive': False
        },
        'password_require_uppercase': {
            'value': 'false',
            'value_type': 'bool',
            'description': 'Require uppercase letters in passwords',
            'is_sensitive': False
        },
        'password_require_lowercase': {
            'value': 'false',
            'value_type': 'bool',
            'description': 'Require lowercase letters in passwords',
            'is_sensitive': False
        },
        'password_require_numbers': {
            'value': 'false',
            'value_type': 'bool',
            'description': 'Require numbers in passwords',
            'is_sensitive': False
        },
        'password_require_special': {
            'value': 'false',
            'value_type': 'bool',
            'description': 'Require special characters in passwords',
            'is_sensitive': False
        },
        'force_https': {
            'value': 'false',
            'value_type': 'bool',
            'description': 'Force HTTPS connections (requires SSL certificate)',
            'is_sensitive': False
        },
        'enable_rate_limiting': {
            'value': 'true',
            'value_type': 'bool',
            'description': 'Enable rate limiting for API endpoints',
            'is_sensitive': False
        },
        'rate_limit_per_minute': {
            'value': '60',
            'value_type': 'int',
            'description': 'Max requests per minute per IP',
            'is_sensitive': False
        },
        'enable_2fa': {
            'value': 'false',
            'value_type': 'bool',
            'description': 'Enable two-factor authentication (future feature)',
            'is_sensitive': False
        },
        'account_activation_mode': {
            'value': 'admin_approval',
            'value_type': 'string',
            'description': 'Account activation mode: admin_approval, email_verification, both, none',
            'is_sensitive': False
        }
    }
}


def initialize_default_settings(db, SystemConfig):
    """Initialize database with default settings if they don't exist"""
    for category, settings in DEFAULT_SETTINGS.items():
        for key, config in settings.items():
            existing = SystemConfig.query.filter_by(key=key).first()
            if not existing:
                SystemConfig.set(
                    key=key,
                    value=config['value'],
                    value_type=config['value_type'],
                    category=category,
                    description=config['description'],
                    is_sensitive=config['is_sensitive']
                )
    db.session.commit()
