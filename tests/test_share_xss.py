"""Integration tests for the public share routes (XSS + security headers)."""


def test_malicious_filename_is_escaped(client, make_shared_file):
    payload = '"><img src=x onerror=alert(1)>.jpg'
    link = make_shared_file(original_filename=payload)

    resp = client.get(f"/s/{link.token}")
    assert resp.status_code == 200
    body = resp.get_data(as_text=True)

    # The raw injection must NEVER appear unescaped in the HTML.
    assert "<img src=x onerror=alert(1)>" not in body
    # It must appear HTML-escaped instead.
    assert "&lt;img src=x onerror=alert(1)&gt;" in body


def test_share_download_has_sandbox_csp(client, make_shared_file):
    link = make_shared_file(original_filename="photo.jpg")

    resp = client.get(f"/s/{link.token}/download")
    assert resp.status_code == 200
    csp = resp.headers.get("Content-Security-Policy", "")
    assert "sandbox" in csp
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"


def test_share_preview_has_sandbox_csp(client, make_shared_file):
    link = make_shared_file(original_filename="photo.jpg")

    resp = client.get(f"/s/{link.token}/preview")
    assert resp.status_code == 200
    csp = resp.headers.get("Content-Security-Policy", "")
    assert "sandbox" in csp


def test_legitimate_image_preview_renders(client, make_shared_file):
    link = make_shared_file(original_filename="vacation.jpg")
    resp = client.get(f"/s/{link.token}")
    body = resp.get_data(as_text=True)
    assert resp.status_code == 200
    # The inline <img> preview should be present for a normal image.
    assert "<img src=" in body
    assert "vacation.jpg" in body


def test_revoked_link_shows_expired(client, make_shared_file, db_session):
    link = make_shared_file(original_filename="photo.jpg")
    link.is_revoked = True
    db_session.session.commit()

    resp = client.get(f"/s/{link.token}")
    assert resp.status_code == 200
    assert "Link Expired" in resp.get_data(as_text=True)
