from app import create_app
from app.config import Config

app = create_app()

def cleanup_orphaned_files():
    """Remove files and folders for users that no longer exist in the database"""
    print("Checking for orphaned files...")
    import os
    import shutil
    
    try:
        from app.models import db
        from sqlalchemy import text
        
        # Use raw SQL to avoid ORM issues during migrations
        with app.app_context():
            result = db.session.execute(text("SELECT id FROM user"))
            valid_user_ids = [str(row[0]) for row in result.fetchall()]
        
        # Check user directories
        user_storage_path = os.path.join(Config.UPLOAD_FOLDER, 'users')
        if os.path.exists(user_storage_path):
            for folder_name in os.listdir(user_storage_path):
                if folder_name not in valid_user_ids:
                    folder_path = os.path.join(user_storage_path, folder_name)
                    if os.path.isdir(folder_path):
                        print(f"Removing orphaned user directory: {folder_path}")
                        shutil.rmtree(folder_path)
    except Exception as e:
        print(f"Skipping orphan cleanup due to: {e}")

if __name__ == '__main__':
    # Initialize storage directories
    Config.init_directories()
    print(f"Storage path is set to: {Config.UPLOAD_FOLDER}")
    
    # Cleanup orphaned files
    cleanup_orphaned_files()
    
    app.run(
        host='0.0.0.0',  # Listen on all interfaces for local network access
        port=5000,
        debug=False 
    )