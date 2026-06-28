"""Unit tests for the Content-Disposition header builder (header injection)."""
from app.utils.speed_limiter import _build_content_disposition


def test_basic_filename():
    value = _build_content_disposition("attachment", "report.pdf")
    assert value.startswith("attachment; ")
    assert 'filename="report.pdf"' in value
    assert "filename*=UTF-8''report.pdf" in value


def test_crlf_is_stripped():
    # A filename with CRLF must not be able to inject a second header.
    # The security property is that no CR/LF survives, so the result stays a
    # single header value (the leftover literal text is harmless).
    malicious = "evil.pdf\r\nSet-Cookie: admin=1"
    value = _build_content_disposition("attachment", malicious)
    assert "\r" not in value
    assert "\n" not in value
    assert value.count("\n") == 0 and value.count("\r") == 0


def test_quotes_are_removed_from_ascii_fallback():
    malicious = 'a".pdf'
    value = _build_content_disposition("attachment", malicious)
    # The ASCII fallback must not contain a raw double quote that breaks out.
    ascii_part = value.split("filename*")[0]
    assert ascii_part.count('"') == 2  # only the surrounding quotes


def test_unicode_filename_uses_rfc5987():
    value = _build_content_disposition("inline", "résumé.pdf")
    assert "filename*=UTF-8''" in value
    # percent-encoded é
    assert "%C3" in value


def test_empty_filename_defaults():
    value = _build_content_disposition("attachment", "")
    assert 'filename="download"' in value
