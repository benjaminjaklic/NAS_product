"""
Database Migration Script for NAS System
Supports SQLite and PostgreSQL
"""
import os
import sys
import sqlite3

def get_db_path():
    """Get the SQLite database path"""
    instance_path = os.path.join(os.path.dirname(__file__), 'instance')
    return os.path.join(instance_path, 'nas.db')

def migrate_sqlite():
    """Migrate SQLite database - add missing columns"""
    db_path = get_db_path()
    
    if not os.path.exists(db_path):
        print(f"Database not found at: {db_path}")
        print("Run the application first to create the database.")
        return False
    
    print(f"Migrating SQLite database at: {db_path}")
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA foreign_keys = ON;")
    
    # Get existing tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [table[0] for table in cursor.fetchall()]
    print(f"Found tables: {tables}")
    
    # Migrations for 'user' table
    if 'user' in tables:
        cursor.execute("PRAGMA table_info(user)")
        columns = [col[1] for col in cursor.fetchall()]
        print(f"User table columns: {columns}")
        
        migrations = [
            ('role', "ALTER TABLE user ADD COLUMN role VARCHAR(50) DEFAULT 'user'"),
            ('email_verified', "ALTER TABLE user ADD COLUMN email_verified BOOLEAN DEFAULT 0"),
            ('confirmation_token', "ALTER TABLE user ADD COLUMN confirmation_token VARCHAR(100)"),
            ('token_created_at', "ALTER TABLE user ADD COLUMN token_created_at DATETIME"),
        ]
        
        for col_name, sql in migrations:
            if col_name not in columns:
                print(f"  Adding '{col_name}' column...")
                try:
                    cursor.execute(sql)
                    print(f"    ✓ Added '{col_name}'")
                except sqlite3.OperationalError as e:
                    print(f"    ✗ Error adding '{col_name}': {e}")
            else:
                print(f"  ✓ '{col_name}' already exists")
    
    # Migrations for 'system_config' table
    if 'system_config' in tables:
        cursor.execute("PRAGMA table_info(system_config)")
        columns = [col[1] for col in cursor.fetchall()]
        
        config_migrations = [
            ('description', "ALTER TABLE system_config ADD COLUMN description TEXT"),
            ('is_sensitive', "ALTER TABLE system_config ADD COLUMN is_sensitive BOOLEAN DEFAULT 0"),
        ]
        
        for col_name, sql in config_migrations:
            if col_name not in columns:
                print(f"  Adding '{col_name}' to system_config...")
                try:
                    cursor.execute(sql)
                    print(f"    ✓ Added '{col_name}'")
                except sqlite3.OperationalError as e:
                    print(f"    ✗ Error: {e}")
    
    # Ensure user_groups has proper CASCADE
    if 'user_groups' in tables:
        # Check if it needs to be recreated
        cursor.execute("SELECT sql FROM sqlite_master WHERE name='user_groups'")
        create_sql = cursor.fetchone()
        if create_sql and 'ON DELETE CASCADE' not in (create_sql[0] or ''):
            print("Recreating 'user_groups' with CASCADE deletes...")
            cursor.execute("DROP TABLE user_groups")
            cursor.execute("""
                CREATE TABLE user_groups (
                    user_id INTEGER,
                    group_id INTEGER,
                    is_admin BOOLEAN,
                    PRIMARY KEY (user_id, group_id),
                    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
                    FOREIGN KEY (group_id) REFERENCES "group"(id) ON DELETE CASCADE
                )
            """)
            print("  ✓ Recreated user_groups with CASCADE")
    
    conn.commit()
    conn.close()
    print("\n✓ SQLite migration complete!")
    return True

def setup_postgresql():
    """Print instructions for PostgreSQL setup"""
    print("""
╔══════════════════════════════════════════════════════════════════╗
║                    PostgreSQL Setup Guide                        ║
╚══════════════════════════════════════════════════════════════════╝

OPTION 1: DOCKER (Recommended - Easiest!)
─────────────────────────────────────────
  docker run --name nas-postgres -e POSTGRES_PASSWORD=yourpassword -p 5432:5432 -d postgres
  
  Then set environment variable:
  set DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/postgres

OPTION 2: NATIVE INSTALL
────────────────────────
  1. INSTALL POSTGRESQL
     - Windows: Download from https://www.postgresql.org/download/windows/
     - Linux: sudo apt install postgresql postgresql-contrib
     - Mac: brew install postgresql

  2. CREATE DATABASE
     psql -U postgres
     CREATE DATABASE nas_system;
     CREATE USER nas_user WITH PASSWORD 'your_secure_password';
     GRANT ALL PRIVILEGES ON DATABASE nas_system TO nas_user;
     \\q

  3. INSTALL PYTHON DRIVER
     pip install psycopg2-binary

  4. SET ENVIRONMENT VARIABLE
     set DATABASE_URL=postgresql://nas_user:your_secure_password@localhost:5432/nas_system

AUTO-FALLBACK BEHAVIOR
──────────────────────
  If PostgreSQL is unavailable, the app automatically falls back to SQLite.
  This means you can start the app immediately - no database setup required!
  
  When PostgreSQL becomes available, just restart the app and it will use it.
""")

def init_postgres():
    """Initialize PostgreSQL database"""
    try:
        import psycopg2
    except ImportError:
        print("psycopg2 not installed. Run: pip install psycopg2-binary")
        return False
    
    db_url = os.environ.get('DATABASE_URL')
    if not db_url or 'postgresql' not in db_url:
        print("Set DATABASE_URL environment variable first.")
        print("Example: set DATABASE_URL=postgresql://user:pass@localhost:5432/nas_system")
        return False
    
    print(f"Connecting to PostgreSQL...")
    
    # Import app and create tables
    from app import create_app, db
    app = create_app()
    
    with app.app_context():
        db.create_all()
        print("✓ PostgreSQL tables created successfully!")
    
    return True

def migrate_sqlite_to_postgres():
    """Migrate data from SQLite to PostgreSQL"""
    try:
        import psycopg2
    except ImportError:
        print("psycopg2 not installed. Run: pip install psycopg2-binary")
        return False
    
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        print("Set DATABASE_URL environment variable first.")
        return False
    
    sqlite_path = get_db_path()
    if not os.path.exists(sqlite_path):
        print("No SQLite database found to migrate from.")
        return False
    
    print("Migrating data from SQLite to PostgreSQL...")
    print("This will copy all data to the new database.")
    
    # Connect to both databases
    sqlite_conn = sqlite3.connect(sqlite_path)
    sqlite_conn.row_factory = sqlite3.Row
    
    from app import create_app, db
    app = create_app()
    
    with app.app_context():
        # Create tables first
        db.create_all()
        
        # Get table list from SQLite
        cursor = sqlite_conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        tables = [row[0] for row in cursor.fetchall()]
        
        for table in tables:
            print(f"  Migrating {table}...")
            cursor.execute(f"SELECT * FROM {table}")
            rows = cursor.fetchall()
            
            if rows:
                columns = [desc[0] for desc in cursor.description]
                for row in rows:
                    values = dict(zip(columns, row))
                    # Use raw SQL for data insertion
                    placeholders = ', '.join([f":{col}" for col in columns])
                    cols = ', '.join(columns)
                    sql = f"INSERT INTO {table} ({cols}) VALUES ({placeholders})"
                    try:
                        db.session.execute(db.text(sql), values)
                    except Exception as e:
                        print(f"    Warning: {e}")
            
            db.session.commit()
            print(f"    ✓ Migrated {len(rows)} rows")
    
    sqlite_conn.close()
    print("\n✓ Data migration complete!")
    return True

def show_status():
    """Show current database status"""
    print("\n╔══════════════════════════════════════════════════════════════════╗")
    print("║                    Database Status                               ║")
    print("╚══════════════════════════════════════════════════════════════════╝\n")
    
    from app.config import Config
    
    db_type = Config.get_active_db()
    using_fallback = Config.is_using_fallback()
    
    print(f"  Active Database:  {db_type.upper()}")
    print(f"  Using Fallback:   {'Yes' if using_fallback else 'No'}")
    print(f"  Connection URI:   {Config.SQLALCHEMY_DATABASE_URI[:50]}...")
    
    if db_type == 'sqlite':
        sqlite_path = get_db_path()
        if os.path.exists(sqlite_path):
            size = os.path.getsize(sqlite_path)
            print(f"  SQLite File:      {sqlite_path}")
            print(f"  Database Size:    {size / 1024 / 1024:.2f} MB")
        else:
            print(f"  SQLite File:      Not created yet")
    
    if using_fallback:
        print("\n  ⚠ PostgreSQL was configured but unavailable.")
        print("    The app is using SQLite as a fallback.")
        print("    Start PostgreSQL and restart the app to use it.")
    
    print()

def show_help():
    print("""
NAS System Database Migration Tool
===================================

Usage: python migrate_db.py [command]

Commands:
  (no args)        Migrate SQLite database (add missing columns)
  --status         Show current database status
  --help           Show this help message
  --postgres-info  Show PostgreSQL setup instructions
  --init-postgres  Initialize PostgreSQL database
  --migrate-data   Migrate data from SQLite to PostgreSQL

Examples:
  python migrate_db.py                    # Fix SQLite schema
  python migrate_db.py --status           # Check which database is active
  python migrate_db.py --postgres-info    # PostgreSQL setup guide
  python migrate_db.py --init-postgres    # Create PostgreSQL tables
""")

if __name__ == '__main__':
    if len(sys.argv) > 1:
        arg = sys.argv[1]
        if arg == '--help':
            show_help()
        elif arg == '--status':
            show_status()
        elif arg == '--postgres-info':
            setup_postgresql()
        elif arg == '--init-postgres':
            init_postgres()
        elif arg == '--migrate-data':
            migrate_sqlite_to_postgres()
        else:
            print(f"Unknown argument: {arg}")
            show_help()
    else:
        # Default: migrate SQLite
        migrate_sqlite()
