"""Force database initialization with all tables and admin user"""
from app import create_app
from app.models import db, User, Role
from datetime import datetime

app = create_app()

with app.app_context():
    print("Dropping all tables...")
    db.drop_all()
    
    print("Creating all tables...")
    db.create_all()
    
    print("Initializing default roles...")
    from app.models import initialize_default_roles
    initialize_default_roles()
    
    print("Initializing system tags...")
    from app.models import initialize_system_tags
    initialize_system_tags()
    
    # Create admin user
    print("\nCreating admin user...")
    admin_role = Role.query.filter_by(name='admin').first()
    admin_user = User(
        username='admin',
        email='admin@localhost',
        is_admin=True,
        is_approved=True,
        storage_limit=admin_role.storage_quota if admin_role else 100 * 1024 * 1024 * 1024,
        storage_used=0,
        role_id=admin_role.id if admin_role else None,
        role='admin',
        created_at=datetime.utcnow()
    )
    admin_user.set_password('admin')
    db.session.add(admin_user)
    db.session.commit()
    print(f"Admin user created: username='admin', password='admin'")
    
    # Create demo user
    print("Creating demo user...")
    demo_role = Role.query.filter_by(name='demo').first()
    demo_user = User(
        username='demo',
        email='demo@localhost',
        is_admin=False,
        is_approved=True,
        is_demo=True,
        storage_limit=demo_role.storage_quota if demo_role else 1 * 1024 * 1024 * 1024,
        storage_used=0,
        role_id=demo_role.id if demo_role else None,
        role='demo',
        created_at=datetime.utcnow()
    )
    demo_user.set_password('demo')
    db.session.add(demo_user)
    db.session.commit()
    print(f"Demo user created: username='demo', password='demo'")
    
    print("\n" + "="*50)
    print("Database initialized successfully!")
    print("="*50)
    
    # Verify tables were created
    from sqlalchemy import inspect
    inspector = inspect(db.engine)
    tables = inspector.get_table_names()
    print(f"\nTables created: {tables}")
    
    # Show users
    users = User.query.all()
    print(f"\nUsers created:")
    for u in users:
        print(f"  - {u.username} (admin={u.is_admin}, approved={u.is_approved})")
    
    # Show roles
    roles = Role.query.all()
    print(f"\nRoles created: {[r.name for r in roles]}")
