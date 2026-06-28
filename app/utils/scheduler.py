"""
Background task scheduler for periodic cleanup tasks
"""
import threading
import time
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class TaskScheduler:
    """Simple background task scheduler"""
    
    def __init__(self, app=None):
        self.app = app
        self.running = False
        self.thread = None
        self.tasks = []
    
    def init_app(self, app):
        self.app = app
        self.register_default_tasks()
    
    def register_default_tasks(self):
        """Register default cleanup tasks"""
        # Demo account cleanup - every hour, check for files older than 24 hours
        self.add_task('demo_cleanup', self.cleanup_demo_files, interval_hours=1)
        
        # Trash cleanup - every 6 hours, remove expired trash
        self.add_task('trash_cleanup', self.cleanup_expired_trash, interval_hours=6)
    
    def add_task(self, name, func, interval_hours=1):
        """Add a periodic task"""
        import time
        self.tasks.append({
            'name': name,
            'func': func,
            'interval': interval_hours * 3600,
            'last_run': time.time()  # Set to now to delay first run
        })
    
    def start(self):
        """Start the scheduler in a background thread"""
        if self.running:
            return
        
        self.running = True
        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()
        logger.info('Task scheduler started')
    
    def stop(self):
        """Stop the scheduler"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)
        logger.info('Task scheduler stopped')
    
    def _run_loop(self):
        """Main scheduler loop"""
        while self.running:
            now = time.time()
            
            for task in self.tasks:
                if task['last_run'] is None or (now - task['last_run']) >= task['interval']:
                    try:
                        with self.app.app_context():
                            logger.info(f"Running scheduled task: {task['name']}")
                            task['func']()
                            task['last_run'] = now
                    except Exception as e:
                        logger.error(f"Error in scheduled task {task['name']}: {str(e)}")
            
            # Sleep for 60 seconds between checks
            time.sleep(60)
    
    def cleanup_demo_files(self):
        """Delete files uploaded by demo accounts older than the configured age."""
        from app.models import db, User, File, SystemConfig
        from app.routes.trash import move_file_to_trash
        
        try:
            # Find demo users
            demo_users = User.query.filter_by(is_demo=True).all()
            
            if not demo_users:
                return
            
            # Respect the admin-configured retention window (default 24h)
            try:
                cleanup_hours = int(SystemConfig.get('demo_cleanup_hours', 24) or 24)
            except (TypeError, ValueError):
                cleanup_hours = 24
            cutoff_time = datetime.utcnow() - timedelta(hours=cleanup_hours)
            deleted_count = 0
            
            for user in demo_users:
                # Find files older than 24 hours
                old_files = File.query.filter(
                    File.user_id == user.id,
                    File.uploaded_at < cutoff_time
                ).all()
                
                for file in old_files:
                    try:
                        # Move to trash with short retention (1 day for demo)
                        move_file_to_trash(file, retention_days=1)
                        
                        # Update user storage
                        user.storage_used = max(0, (user.storage_used or 0) - (file.file_size or 0))
                        
                        # Remove associated share links and versions (file_id is NOT NULL)
                        from app.models import ShareLink, FileVersion
                        ShareLink.query.filter_by(file_id=file.id).delete()
                        FileVersion.query.filter_by(file_id=file.id).delete()
                        
                        # Delete file record
                        db.session.delete(file)
                        deleted_count += 1
                    except Exception as e:
                        logger.error(f"Error deleting demo file {file.id}: {str(e)}")
                
            if deleted_count > 0:
                db.session.commit()
                logger.info(f"Demo cleanup: Deleted {deleted_count} files")
                
        except Exception as e:
            db.session.rollback()
            logger.error(f"Demo cleanup failed: {str(e)}")
    
    def cleanup_expired_trash(self):
        """Remove files that have been in trash past retention period"""
        from app.routes.trash import cleanup_expired_trash
        
        try:
            deleted = cleanup_expired_trash()
            if deleted > 0:
                logger.info(f"Trash cleanup: Permanently deleted {deleted} expired files")
        except Exception as e:
            logger.error(f"Trash cleanup failed: {str(e)}")


# Global scheduler instance
scheduler = TaskScheduler()


def init_scheduler(app):
    """Initialize and start the scheduler"""
    scheduler.init_app(app)
    scheduler.start()
    return scheduler
