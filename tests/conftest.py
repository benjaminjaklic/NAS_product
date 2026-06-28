"""Shared pytest fixtures for the NAS System test suite.

These tests run against an isolated, temporary SQLite database and a temporary
upload directory so they never touch real data.
"""
import os
import tempfile
import shutil

import pytest

# Configure the environment BEFORE importing the application, because
# app.config.Config evaluates SQLALCHEMY_DATABASE_URI at import time.
_TEST_DB_FD, _TEST_DB_PATH = tempfile.mkstemp(suffix=".db", prefix="nas_test_")
os.close(_TEST_DB_FD)
os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_PATH}"
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("WTF_CSRF_SECRET_KEY", "test-csrf-key")

_TEST_UPLOAD_DIR = tempfile.mkdtemp(prefix="nas_test_uploads_")


@pytest.fixture(scope="session")
def app():
    """Create a single application instance for the whole test session."""
    from app import create_app

    application = create_app()
    application.config.update(
        TESTING=True,
        WTF_CSRF_ENABLED=False,  # forms in tests post without CSRF tokens
        UPLOAD_FOLDER=_TEST_UPLOAD_DIR,
    )

    yield application

    # Cleanup temp artifacts at the end of the session
    shutil.rmtree(_TEST_UPLOAD_DIR, ignore_errors=True)
    try:
        os.remove(_TEST_DB_PATH)
    except OSError:
        pass


@pytest.fixture()
def db_session(app):
    """Provide a clean database for each test (drop + recreate all tables)."""
    from app import db

    with app.app_context():
        db.drop_all()
        db.create_all()
        yield db
        db.session.remove()


@pytest.fixture()
def client(app, db_session):
    """A test client backed by a freshly-reset database."""
    return app.test_client()


@pytest.fixture()
def make_user(app, db_session):
    """Factory to create a persisted user."""
    from app.models import User

    def _make(username="alice", email="alice@example.com", is_admin=False,
              password="Passw0rd!"):
        user = User(
            username=username,
            email=email,
            is_admin=is_admin,
            is_approved=True,
            storage_limit=10 * 1024 * 1024 * 1024,
            storage_used=0,
        )
        user.set_password(password)
        db_session.session.add(user)
        db_session.session.commit()
        return user

    return _make


@pytest.fixture()
def make_shared_file(app, db_session, make_user):
    """Factory that creates a real file on disk, a File row and a ShareLink."""
    import secrets
    from app.models import File, ShareLink

    def _make(original_filename="photo.jpg", content=b"fake-bytes",
              password=None, allow_preview=True, allow_download=True):
        user = make_user()
        # Write a real file inside the configured (temp) upload folder so that
        # validate_file_path() accepts it.
        disk_name = secrets.token_hex(8) + ".jpg"
        path = os.path.join(app.config["UPLOAD_FOLDER"], disk_name)
        with open(path, "wb") as fh:
            fh.write(content)

        file_row = File(
            filename=disk_name,
            original_filename=original_filename,
            file_type="image",
            file_size=len(content),
            category="image",
            path=path,
            user_id=user.id,
            is_public=False,
        )
        db_session.session.add(file_row)
        db_session.session.commit()

        password_hash = None
        if password:
            from werkzeug.security import generate_password_hash
            password_hash = generate_password_hash(password)

        link = ShareLink(
            file_id=file_row.id,
            token=secrets.token_urlsafe(16),
            created_by=user.id,
            password_hash=password_hash,
            allow_preview=allow_preview,
            allow_download=allow_download,
        )
        db_session.session.add(link)
        db_session.session.commit()
        return link

    return _make
