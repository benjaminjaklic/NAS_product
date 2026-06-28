import os
import re
import logging
from functools import lru_cache

try:
    import requests
except ImportError:  # pragma: no cover
    requests = None

logger = logging.getLogger(__name__)

VERSION_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    'VERSION'
)

SEMVER_PATTERN = re.compile(
    r'^(?P<major>0|[1-9]\d*)\.(?P<minor>0|[1-9]\d*)\.(?P<patch>0|[1-9]\d*)'
    r'(?:-(?P<prerelease>[a-zA-Z0-9.\-]+))?(?:\+(?P<build>[a-zA-Z0-9.\-]+))?$'
)


@lru_cache(maxsize=1)
def get_current_version():
    """Read the current application version from the VERSION file.

    Falls back to '0.0.0' if the file is missing or unreadable.
    """
    try:
        with open(VERSION_FILE, 'r', encoding='utf-8') as f:
            version = f.read().strip()
            if version:
                return version
    except (OSError, IOError) as e:
        logger.warning(f"Could not read VERSION file: {e}")
    return '0.0.0'


def parse_version(version):
    """Parse a semver-like version string into a comparable tuple.

    Returns None if the version is not a valid semver.
    Pre-release versions are sorted before release versions.
    """
    version = (version or '').strip()
    if not version:
        return None
    match = SEMVER_PATTERN.match(version)
    if not match:
        return None
    parts = match.groupdict()
    major = int(parts['major'])
    minor = int(parts['minor'])
    patch = int(parts['patch'])
    prerelease = parts['prerelease'] or ''
    # Build metadata is ignored for comparison per semver spec.
    # Release versions (no prerelease) must outrank any prerelease of the
    # same major.minor.patch. We encode this with a discriminator: 1 for
    # release, 0 for prerelease, then the prerelease identifier tuple.
    pre_tuple = tuple(
        int(part) if part.isdigit() else part
        for part in prerelease.split('.') if part
    )
    is_release = 1 if not prerelease else 0
    return (major, minor, patch, is_release, pre_tuple)


def is_newer_version(new_version, current_version):
    """Return True if new_version is strictly newer than current_version."""
    new = parse_version(new_version)
    current = parse_version(current_version)
    if not new or not current:
        return False
    return new > current


def _get_github_release_url(github_repo):
    """Build the GitHub releases API URL from an 'owner/repo' string."""
    repo = (github_repo or '').strip().strip('/')
    if not repo:
        return None
    # Accept both 'owner/repo' and full URLs.
    if repo.startswith('https://github.com/'):
        repo = repo.replace('https://github.com/', '')
    if repo.startswith('github.com/'):
        repo = repo.replace('github.com/', '')
    if '/' not in repo:
        return None
    return f"https://api.github.com/repos/{repo}/releases/latest"


def check_for_update(github_repo, timeout=10):
    """Check GitHub releases for a newer version.

    Returns a dict with the current version, latest version, update
    availability, and a download URL if available. Returns None if no
    repo is configured or if the check fails.
    """
    current = get_current_version()
    result = {
        'current_version': current,
        'latest_version': None,
        'update_available': False,
        'download_url': None,
        'release_url': None,
        'error': None,
    }

    if not requests:
        result['error'] = 'requests library not available'
        return result

    url = _get_github_release_url(github_repo)
    if not url:
        result['error'] = 'no GitHub repository configured'
        return result

    try:
        response = requests.get(url, timeout=timeout)
        response.raise_for_status()
        data = response.json()

        tag = data.get('tag_name', '')
        latest = tag.lstrip('v')
        result['latest_version'] = latest
        result['release_url'] = data.get('html_url')
        result['download_url'] = data.get('zipball_url') or data.get('tarball_url')
        result['update_available'] = is_newer_version(latest, current)
    except requests.exceptions.RequestException as e:
        logger.warning(f"Update check failed: {e}")
        result['error'] = str(e)
    except Exception as e:
        logger.warning(f"Unexpected error during update check: {e}")
        result['error'] = str(e)

    return result


def format_version_info(update_info):
    """Return a human-readable summary from a check_for_update result."""
    current = update_info.get('current_version', 'unknown')
    latest = update_info.get('latest_version')
    if not latest:
        return f"Running version {current}. Could not check for updates."
    if update_info.get('update_available'):
        return f"Update available: {current} → {latest}"
    return f"You are running the latest version ({current})."
