"""Tests that the setup wizard cannot be used to create extra admins."""


def test_setup_complete_blocks_new_admin(client, make_user):
    # An admin already exists -> setup endpoint must be locked down.
    make_user(username="root", email="root@example.com", is_admin=True)

    resp = client.post("/setup/api/complete", json={
        "admin_username": "attacker",
        "admin_password": "Hacked123!",
        "admin_email": "attacker@example.com",
    })

    assert resp.status_code == 403

    # Ensure the attacker account was NOT created.
    from app.models import User
    assert User.query.filter_by(username="attacker").first() is None


def test_setup_rejects_weak_admin_password(client):
    # No admin exists yet, so we reach the password-strength check.
    resp = client.post("/setup/api/complete", json={
        "admin_username": "admin",
        "admin_password": "weak",
        "admin_email": "admin@example.com",
    })
    assert resp.status_code == 400
    assert "error" in resp.get_json()


def test_setup_creates_first_admin(client):
    resp = client.post("/setup/api/complete", json={
        "admin_username": "admin",
        "admin_password": "Str0ngPass!",
        "admin_email": "admin@example.com",
        "app_name": "Test NAS",
    })
    assert resp.status_code == 200
    assert resp.get_json().get("success") is True

    from app.models import User
    admin = User.query.filter_by(username="admin").first()
    assert admin is not None
    assert admin.is_admin is True
