"""
Speed limiting utilities for file uploads and downloads.

Provides throttled streaming for downloads and throttled writing for uploads,
enforcing per-role speed limits defined in the Role model.
"""
import time
import os
import logging
from urllib.parse import quote
from flask import Response, request
from flask_login import current_user

logger = logging.getLogger(__name__)

# Default chunk size for throttled streaming (64KB)
DEFAULT_CHUNK_SIZE = 64 * 1024

# Content-Security-Policy used when serving user-uploaded files. It disables
# script execution (sandbox without allow-scripts) so that malicious SVG/HTML
# uploads cannot run JavaScript in our origin when previewed inline.
UNTRUSTED_FILE_CSP = "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox"


def _build_content_disposition(disposition, filename):
    """Build a safe Content-Disposition header value.

    Strips control characters and uses RFC 5987 encoding for the filename so a
    crafted filename cannot inject extra headers or break out of the value.
    """
    if not filename:
        filename = 'download'
    # Remove CR/LF and other control chars that could enable header injection
    ascii_fallback = ''.join(c for c in filename if 32 <= ord(c) < 127 and c not in '"\\')
    ascii_fallback = ascii_fallback or 'download'
    encoded = quote(filename, safe='')
    return f"{disposition}; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded}"


def _apply_untrusted_file_headers(response, inline_disposition_name=None):
    """Apply security headers to responses that serve user-uploaded content."""
    response.headers['Content-Security-Policy'] = UNTRUSTED_FILE_CSP
    response.headers['X-Content-Type-Options'] = 'nosniff'
    if inline_disposition_name is not None:
        response.headers['Content-Disposition'] = _build_content_disposition(
            'inline', inline_disposition_name
        )
    return response


def get_user_speed_limits(user=None):
    """Get upload and download speed limits for a user based on their role.
    
    Returns:
        tuple: (upload_limit_bytes_per_sec, download_limit_bytes_per_sec)
               0 means unlimited
    """
    if user is None:
        user = current_user
    
    if not user or not hasattr(user, 'role_obj'):
        return (0, 0)
    
    role = user.role_obj
    if not role:
        return (0, 0)
    
    upload_limit = role.upload_speed_limit or 0
    download_limit = role.download_speed_limit or 0
    
    return (upload_limit, download_limit)


def throttled_file_stream(file_path, speed_limit=0, chunk_size=DEFAULT_CHUNK_SIZE):
    """Generator that yields file chunks with throttling.
    
    Args:
        file_path: Path to the file to stream
        speed_limit: Maximum bytes per second (0 = unlimited)
        chunk_size: Size of each chunk to yield
    
    Yields:
        bytes: File data chunks
    """
    if speed_limit > 0:
        # Adjust chunk size for smoother throttling
        # Use smaller chunks for low speed limits
        if speed_limit < chunk_size:
            chunk_size = max(4096, speed_limit // 4)
    
    with open(file_path, 'rb') as f:
        while True:
            start_time = time.time()
            data = f.read(chunk_size)
            if not data:
                break
            yield data
            
            if speed_limit > 0:
                # Calculate how long we should have taken
                expected_duration = len(data) / speed_limit
                actual_duration = time.time() - start_time
                sleep_time = expected_duration - actual_duration
                if sleep_time > 0:
                    time.sleep(sleep_time)


def throttled_range_stream(file_path, start, length, speed_limit=0, chunk_size=DEFAULT_CHUNK_SIZE):
    """Generator that yields a range of file chunks with throttling.
    
    Args:
        file_path: Path to the file to stream
        start: Byte offset to start reading from
        length: Total bytes to read
        speed_limit: Maximum bytes per second (0 = unlimited)
        chunk_size: Size of each chunk to yield
    
    Yields:
        bytes: File data chunks
    """
    if speed_limit > 0 and speed_limit < chunk_size:
        chunk_size = max(4096, speed_limit // 4)
    
    with open(file_path, 'rb') as f:
        f.seek(start)
        remaining = length
        while remaining > 0:
            start_time = time.time()
            read_size = min(chunk_size, remaining)
            data = f.read(read_size)
            if not data:
                break
            remaining -= len(data)
            yield data
            
            if speed_limit > 0:
                expected_duration = len(data) / speed_limit
                actual_duration = time.time() - start_time
                sleep_time = expected_duration - actual_duration
                if sleep_time > 0:
                    time.sleep(sleep_time)


def make_throttled_download_response(file_path, download_name, speed_limit=0, mimetype=None):
    """Create a Flask Response that streams a file with speed limiting.
    
    Args:
        file_path: Path to the file to send
        download_name: Filename for the Content-Disposition header
        speed_limit: Maximum bytes per second (0 = unlimited)
        mimetype: MIME type (auto-detected if not provided)
    
    Returns:
        Flask Response object
    """
    import mimetypes as mt
    
    if not mimetype:
        mimetype = mt.guess_type(download_name)[0] or 'application/octet-stream'
    
    file_size = os.path.getsize(file_path)
    
    # If no speed limit, use regular streaming (faster)
    if speed_limit <= 0:
        from flask import send_file
        response = send_file(file_path, as_attachment=True, download_name=download_name)
        return _apply_untrusted_file_headers(response)
    
    logger.debug(f"Throttled download: {download_name}, limit={speed_limit} B/s, size={file_size}")
    
    response = Response(
        throttled_file_stream(file_path, speed_limit=speed_limit),
        mimetype=mimetype,
        direct_passthrough=True
    )
    
    # Set download headers (filename is safely encoded to prevent header injection)
    response.headers['Content-Disposition'] = _build_content_disposition('attachment', download_name)
    response.headers['Content-Length'] = str(file_size)
    response.headers['X-Speed-Limit'] = str(speed_limit)
    
    return _apply_untrusted_file_headers(response)


def make_throttled_inline_response(file_path, mimetype, speed_limit=0):
    """Create a Flask Response that streams a file inline with speed limiting.
    
    Args:
        file_path: Path to the file to send
        mimetype: MIME type for the response
        speed_limit: Maximum bytes per second (0 = unlimited)
    
    Returns:
        Flask Response object
    """
    file_size = os.path.getsize(file_path)
    
    # If no speed limit, use regular send_file
    if speed_limit <= 0:
        from flask import send_file
        response = send_file(file_path, mimetype=mimetype)
        return _apply_untrusted_file_headers(response)
    
    response = Response(
        throttled_file_stream(file_path, speed_limit=speed_limit),
        mimetype=mimetype,
        direct_passthrough=True
    )
    response.headers['Content-Length'] = str(file_size)
    
    return _apply_untrusted_file_headers(response)


def throttled_save(source_stream, dest_path, speed_limit=0, chunk_size=DEFAULT_CHUNK_SIZE):
    """Save an uploaded file to disk with speed throttling.
    
    This throttles the rate at which data is written to disk, which in turn
    slows down how fast the server acknowledges received data (backpressure).
    
    Args:
        source_stream: File-like object to read from (e.g., request.files['file'])
        dest_path: Destination file path
        speed_limit: Maximum bytes per second (0 = unlimited)
        chunk_size: Size of each chunk to write
    
    Returns:
        int: Total bytes written
    """
    if speed_limit > 0 and speed_limit < chunk_size:
        chunk_size = max(4096, speed_limit // 4)
    
    total_written = 0
    
    with open(dest_path, 'wb') as dest:
        while True:
            start_time = time.time()
            chunk = source_stream.read(chunk_size)
            if not chunk:
                break
            dest.write(chunk)
            total_written += len(chunk)
            
            if speed_limit > 0:
                expected_duration = len(chunk) / speed_limit
                actual_duration = time.time() - start_time
                sleep_time = expected_duration - actual_duration
                if sleep_time > 0:
                    time.sleep(sleep_time)
    
    return total_written
