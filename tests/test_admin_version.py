"""Tests for the admin version API endpoint."""


def test_admin_version_requires_login(client):
    resp = client.get('/admin/api/version')
    assert resp.status_code in (302, 401)


def test_admin_version_returns_current_version(client, make_user):
    user = make_user(username='admin', email='admin@example.com', is_admin=True)

    # Log in as admin.
    resp = client.post('/auth/login', data={
        'username': 'admin',
        'password': 'Passw0rd!',
    }, follow_redirects=True)
    assert resp.status_code == 200

    resp = client.get('/admin/api/version')
    assert resp.status_code == 200
    data = resp.get_json()

    assert 'current_version' in data
    assert data['current_version'].count('.') >= 2
    assert 'update_available' in data
    assert 'error' in data
