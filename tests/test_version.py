"""Tests for the version and update-check system."""
from unittest import mock

from app.version import (
    get_current_version,
    parse_version,
    is_newer_version,
    check_for_update,
    _get_github_release_url,
)


def test_get_current_version_reads_version_file():
    version = get_current_version()
    assert isinstance(version, str)
    assert version.count('.') >= 2


def test_parse_valid_semver():
    assert parse_version('1.2.3') == (1, 2, 3, 1, ())
    assert parse_version('0.0.1-alpha.1') == (0, 0, 1, 0, ('alpha', 1))
    assert parse_version('2.0.0+build.123') == (2, 0, 0, 1, ())


def test_parse_invalid_version():
    assert parse_version('') is None
    assert parse_version('v1.2.3') is None
    assert parse_version('not-a-version') is None


def test_is_newer_version():
    assert is_newer_version('1.0.1', '1.0.0') is True
    assert is_newer_version('1.1.0', '1.0.5') is True
    assert is_newer_version('2.0.0', '1.9.9') is True
    assert is_newer_version('1.0.0', '1.0.0') is False
    assert is_newer_version('1.0.0', '1.0.1') is False
    # Pre-release of same version is older than release.
    assert is_newer_version('1.0.0-alpha', '1.0.0') is False
    assert is_newer_version('1.0.0', '1.0.0-alpha') is True


def test_get_github_release_url_formats_owner_repo():
    assert _get_github_release_url('owner/repo') == (
        'https://api.github.com/repos/owner/repo/releases/latest'
    )
    assert _get_github_release_url('https://github.com/owner/repo') == (
        'https://api.github.com/repos/owner/repo/releases/latest'
    )
    assert _get_github_release_url('') is None
    assert _get_github_release_url('owner') is None


def test_check_for_update_without_repo():
    result = check_for_update('')
    assert result['current_version'] == get_current_version()
    assert result['latest_version'] is None
    assert result['update_available'] is False
    assert 'no GitHub repository configured' in result['error']


def test_check_for_update_finds_update():
    mock_response = mock.Mock()
    mock_response.json.return_value = {
        'tag_name': 'v1.1.0',
        'html_url': 'https://github.com/owner/repo/releases/tag/v1.1.0',
        'zipball_url': 'https://github.com/owner/repo/archive/refs/tags/v1.1.0.zip',
    }
    mock_response.raise_for_status.return_value = None

    with mock.patch('app.version.requests.get', return_value=mock_response):
        result = check_for_update('owner/repo', timeout=1)

    assert result['current_version'] == get_current_version()
    assert result['latest_version'] == '1.1.0'
    assert result['update_available'] is True
    assert result['release_url'] == 'https://github.com/owner/repo/releases/tag/v1.1.0'


def test_check_for_update_no_update():
    current = get_current_version()
    mock_response = mock.Mock()
    mock_response.json.return_value = {
        'tag_name': f'v{current}',
        'html_url': 'https://github.com/owner/repo/releases/tag/v1.0.0',
        'zipball_url': 'https://github.com/owner/repo/archive/refs/tags/v1.0.0.zip',
    }
    mock_response.raise_for_status.return_value = None

    with mock.patch('app.version.requests.get', return_value=mock_response):
        result = check_for_update('owner/repo', timeout=1)

    assert result['update_available'] is False
    assert result['latest_version'] == current


def test_check_for_update_handles_network_error():
    with mock.patch('app.version.requests.get', side_effect=Exception('network down')):
        result = check_for_update('owner/repo', timeout=1)

    assert result['update_available'] is False
    assert 'network down' in result['error']
