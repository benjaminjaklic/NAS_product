"""Unit tests for password and email validation helpers."""
import pytest

from app.utils.security_utils import validate_password_strength, is_valid_email


@pytest.mark.parametrize("password", [
    "Passw0rd",       # 8 chars, letter + number
    "abcd1234",       # letters + numbers
    "S3cretPhrase",
])
def test_strong_passwords_accepted(password):
    ok, msg = validate_password_strength(password)
    assert ok is True
    assert msg == ""


@pytest.mark.parametrize("password,reason", [
    ("", "required"),
    ("short1", "8 characters"),      # too short
    ("allletters", "number"),         # no digit
    ("12345678", "letter"),           # no letter
])
def test_weak_passwords_rejected(password, reason):
    ok, msg = validate_password_strength(password)
    assert ok is False
    assert reason in msg


def test_password_over_bcrypt_limit_rejected():
    # bcrypt silently truncates beyond 72 bytes; we must reject longer inputs.
    ok, msg = validate_password_strength("A1" + "x" * 80)
    assert ok is False
    assert "72" in msg


@pytest.mark.parametrize("email", [
    "user@example.com",
    "a.b+tag@sub.domain.co",
])
def test_valid_emails(email):
    assert is_valid_email(email) is True


@pytest.mark.parametrize("email", [
    "",
    "no-at-sign",
    "admin@localhost",      # no dot in domain
    "spaces in@email.com",
    "trailing@dot.",
])
def test_invalid_emails(email):
    assert is_valid_email(email) is False
