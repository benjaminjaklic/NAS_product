# NAS System

A self-hosted Network Attached Storage platform built with Flask and React. Upload, manage, and share files from your own hardware with multi-user support, role-based access control, and a modern web interface.

![Python](https://img.shields.io/badge/Python-3.9+-blue.svg)
![Flask](https://img.shields.io/badge/Flask-2.3-green.svg)
![React](https://img.shields.io/badge/React-18-61dafb.svg)
![SQLite](https://img.shields.io/badge/SQLite-Default-lightgrey.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supported-336791.svg)
![License](https://img.shields.io/badge/License-Proprietary-red.svg)

---

## Table of Contents

- [Quick Start](#quick-start)
- [Features](#features)
- [Installation](#installation)
- [Configuration](#configuration)
- [Database](#database)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Development](#development)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)
- [License](#license)

---

## Quick Start

```bash
# 1. Create environment config
cp .env.example .env

# 2. Install Python dependencies
python -m venv venv
source venv/bin/activate        # Linux/macOS
# venv\Scripts\activate.bat     # Windows
pip install -r requirements.txt

# 3. Build the React frontend
cd frontend && npm install && npm run build && cd ..

# 4. Start
python run.py
```

Open **http://localhost:5000** — the setup wizard walks you through admin account creation, storage configuration, and optional email/demo settings.

---

## Features

### File Management
- **Upload** — Drag-and-drop or click, up to 20 GB per file, background upload queue with progress indicator
- **Download** — Streaming downloads with optional per-role speed throttling
- **Preview** — In-browser preview for images, PDFs, video, audio, and text files
- **Tags** — Custom color-coded tags for organization, search, and filtering
- **Versioning** — Automatic file version history with restore and delete
- **Video Streaming** — HTTP range-request support for seeking in large videos
- **Live Dashboard** — Auto-polling file list and storage info (no manual refresh needed)

### Trash System
- **Soft Delete** — Files are tagged and moved to trash, not immediately removed
- **30-Day Retention** — Background scheduler auto-purges expired trash
- **One-Click Restore** — Restore files from the deleted view
- **Storage Exclusion** — Trashed files are excluded from quota calculations

### File Sharing
- **Public Links** — Share files without requiring the recipient to log in
- **Password Protection** — Optional password on share links
- **Expiration** — Time-limited links (hours, days, or never)
- **Preview/Download Control** — Enable or disable each per link
- **One-Time Downloads** — Link auto-revokes after first download
- **Instant Revocation** — Disable any share link at any time

### Notes
- **Personal Notes** — Create, edit, pin, and color-code notes
- **Categories** — Study Notes, To-Do, Ideas, Schedule, Research, Other
- **Full-Text Search** — Filter across all notes instantly

### Theme Customization
- **Light / Dark Mode** — One-click toggle
- **Full Color Picker** — Customize primary, background, card, nav, text, and border colors
- **Live Preview** — See changes before saving
- **Export / Import** — Save and share themes as JSON

### User & Role Management (Admin)
- **User Approval** — Require admin approval, email verification, or allow open registration
- **Role-Based Access** — Assign built-in or custom roles with per-role storage quotas
- **Speed Limits** — Per-role upload and download speed throttling
- **Storage Tiers** — Demo (1 GB), Basic (50 GB), Plus (100 GB), Pro (200 GB) — all configurable
- **Activity Logs** — Filterable, paginated logs with CSV export
- **Telemetry** — Daily activity charts and upload trends (30-day window)
- **Storage Requests** — Users can request quota upgrades; admins approve or reject

### Security
- **CSRF Protection** — All forms and API calls protected
- **Secure Sessions** — HTTPOnly, SameSite=Lax cookies
- **Password Hashing** — bcrypt with automatic migration from legacy PBKDF2
- **Rate Limiting** — Per-IP throttling with login-specific brute-force protection
- **IP Blocking** — Auto-block after repeated failures
- **Path Traversal Prevention** — All file paths validated against the storage root
- **Security Headers** — HSTS, X-Content-Type-Options, X-Frame-Options, X-XSS-Protection
- **Blocked Extensions** — Dangerous file types (exe, bat, cmd, ps1, etc.) rejected on upload
- **Startup Cleanup** — Orphaned user directories are automatically removed on launch

### Background Scheduler
- **Demo Cleanup** — Deletes demo account files older than 24 hours
- **Trash Cleanup** — Permanently removes expired trash every 6 hours

---

## Installation

### Prerequisites

- **Python 3.9+**
- **Node.js 18+** and npm

### Automated Installers

Platform-specific scripts are in the `installer/` directory. Each installer checks prerequisites, installs dependencies, builds the frontend, generates a `.env` with secure random keys, and creates start/stop scripts.

**Windows (PowerShell — recommended):**
```powershell
cd installer
powershell -ExecutionPolicy Bypass -File install.ps1
```

**Windows (CMD):**
```cmd
cd installer
install.bat
```

**macOS:**
```bash
cd installer && chmod +x install-mac.sh && ./install-mac.sh
```

**Linux (Ubuntu/Debian/CentOS/Fedora/Arch):**
```bash
cd installer && chmod +x install-linux.sh && ./install-linux.sh
```

The installers will:
1. Check and optionally install Python 3.9+ and Node.js 18+
2. Copy application files to the chosen install directory
3. Generate a `.env` file with cryptographically secure keys
4. Create a Python virtual environment and install dependencies
5. Build the React frontend
6. Create start/stop scripts and desktop shortcuts (Windows/macOS)
7. Optionally install as a system service (Windows via NSSM, Linux via systemd, macOS via launchd)

**Uninstallers** are provided for Linux and macOS (`uninstall-linux.sh`, `uninstall-mac.sh`) with optional data backup.

### Manual Installation

```bash
# 1. Copy and configure environment
cp .env.example .env
# Generate secure keys:
python -c "import secrets; print(secrets.token_hex(32))"
# Paste output into SECRET_KEY, WTF_CSRF_SECRET_KEY, SECURITY_PASSWORD_SALT in .env

# 2. Create virtual environment and install dependencies
python -m venv venv
source venv/bin/activate          # Linux/macOS
# venv\Scripts\activate.bat       # Windows
pip install -r requirements.txt

# 3. Build the React frontend
cd frontend && npm install && npm run build && cd ..

# 4. Start the application
python run.py
```

### First Launch

Navigate to **http://localhost:5000**. The setup wizard guides you through:

- Admin account creation
- Optional demo account (files auto-cleaned after 24 hours)
- Storage path configuration
- Email / SMTP setup (optional)
- Account activation mode (admin approval, email verification, or open)

---

## Configuration

Copy `.env.example` to `.env` and edit as needed. The installers do this automatically with secure random keys.

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | *(auto-generated)* | Flask session signing key. **Set a fixed value for production.** |
| `WTF_CSRF_SECRET_KEY` | *(auto-generated)* | CSRF token signing key |
| `SECURITY_PASSWORD_SALT` | *(auto-generated)* | Salt for password reset tokens |
| `DATABASE_URL` | *(empty → SQLite)* | Connection string. See [Database](#database). |
| `DEFAULT_STORAGE_LIMIT_GB` | `50` | Default storage quota per user (GB) |
| `MAIL_SERVER` | `smtp.gmail.com` | SMTP server for email features |
| `MAIL_PORT` | `587` | SMTP port |
| `MAIL_USE_TLS` | `true` | Enable STARTTLS |
| `MAIL_USERNAME` | *(empty)* | SMTP username |
| `MAIL_PASSWORD` | *(empty)* | SMTP password or app-specific password |
| `SESSION_COOKIE_SECURE` | `False` | Set `True` only when serving over HTTPS |
| `ADMIN_USERNAME` | `admin` | Pre-filled admin username for setup wizard |
| `ADMIN_EMAIL` | `admin@example.com` | Pre-filled admin email for setup wizard |
| `ADMIN_PASSWORD` | `admin` | Pre-filled admin password for setup wizard |
| `DEMO_USERNAME` | *(empty)* | If set, creates a demo account on startup |
| `DEMO_EMAIL` | *(empty)* | Demo account email |
| `DEMO_PASSWORD` | *(empty)* | Demo account password |
| `ACCOUNT_ACTIVATION_MODE` | `admin_approval` | `admin_approval`, `email_verification`, `both`, or `none` |
| `AI_API_URL` | *(empty)* | Optional external AI summarization endpoint |

> **Important:** If `SECRET_KEY` is not set, the app generates a random key on each startup, which invalidates all existing sessions. Always set a fixed key for production.

---

## Database

| Database | Use Case | Config |
|----------|----------|--------|
| **SQLite** | Default — zero config, single user or small team | No `DATABASE_URL` needed |
| **PostgreSQL** | Recommended for production and multi-user | `postgresql://user:pass@host:5432/dbname` |
| **MySQL** | Alternative production database | `mysql://user:pass@host:3306/dbname` |

### Auto-Fallback

1. **`DATABASE_URL` configured and reachable** → Uses the configured database
2. **`DATABASE_URL` configured but unreachable** → Falls back to SQLite automatically
3. **`DATABASE_URL` not set** → Uses SQLite (default)

The application always starts, even if the external database is down.

### PostgreSQL with Docker

```bash
docker run --name nas-postgres \
  -e POSTGRES_USER=nas_admin \
  -e POSTGRES_PASSWORD=CHANGE_ME \
  -e POSTGRES_DB=nas_database \
  -p 5432:5432 \
  -v nas-postgres-data:/var/lib/postgresql/data \
  --restart always \
  -d postgres:15
```

Add to `.env`:
```
DATABASE_URL=postgresql://nas_admin:CHANGE_ME@localhost:5432/nas_database
```

### MySQL with Docker

```bash
docker run --name nas-mysql \
  -e MYSQL_ROOT_PASSWORD=CHANGE_ME \
  -e MYSQL_DATABASE=nas_database \
  -e MYSQL_USER=nas_admin \
  -e MYSQL_PASSWORD=CHANGE_ME \
  -p 3306:3306 \
  -v nas-mysql-data:/var/lib/mysql \
  --restart always \
  -d mysql:8
```

Add to `.env`:
```
DATABASE_URL=mysql://nas_admin:CHANGE_ME@localhost:3306/nas_database
```

---

## Project Structure

```
NAS-System-Deploy/
├── app/
│   ├── __init__.py              # App factory, extensions, blueprint registration
│   ├── config.py                # Configuration (reads .env, database fallback logic)
│   ├── models.py                # SQLAlchemy models (User, File, Tag, Role, etc.)
│   ├── forms.py                 # WTForms form definitions
│   ├── routes/
│   │   ├── admin.py             # Admin dashboard, user management, roles, logs
│   │   ├── ai_dashboard.py      # Optional AI summarization dashboard
│   │   ├── api.py               # Notes CRUD API
│   │   ├── auth.py              # Authentication, registration, profile, password reset
│   │   ├── files.py             # File upload, download, delete, tags, sharing, versioning
│   │   ├── groups.py            # Group management
│   │   ├── settings.py          # Theme customization API
│   │   ├── setup.py             # Setup wizard, server settings
│   │   ├── share.py             # Public share link viewer
│   │   └── trash.py             # Trash management (restore, permanent delete, empty)
│   ├── utils/
│   │   ├── default_settings.py  # Default system configuration values
│   │   ├── email_utils.py       # Email sending, token generation
│   │   ├── error_handlers.py    # HTTP error page handlers
│   │   ├── file_handlers.py     # File utility functions
│   │   ├── rate_limiter.py      # Per-IP request rate limiting
│   │   ├── scheduler.py         # Background task scheduler (demo/trash cleanup)
│   │   ├── security_utils.py    # Path validation, IP blocking, auth helpers
│   │   ├── speed_limiter.py     # Upload/download speed throttling
│   │   └── video_handler.py     # Video streaming with range request support
│   ├── static/                  # Static assets and built React app
│   └── templates/               # Jinja2 templates (auth pages, admin, groups, share)
├── frontend/
│   ├── src/
│   │   ├── components/          # 23 React components
│   │   └── context/             # 5 React context providers
│   ├── package.json
│   └── vite.config.js           # Vite build config (outputs to app/static/react/)
├── installer/                   # Platform installers and uninstallers
│   ├── install.ps1              # Windows PowerShell installer
│   ├── install.bat              # Windows CMD installer
│   ├── install-linux.sh         # Linux installer (Debian/RHEL/Arch)
│   ├── install-mac.sh           # macOS installer (Homebrew)
│   ├── uninstall-linux.sh       # Linux uninstaller with backup option
│   └── uninstall-mac.sh         # macOS uninstaller with backup option
├── files/                       # User file storage (gitignored)
├── logs/                        # Application logs (gitignored)
├── instance/                    # SQLite database (gitignored)
├── .env.example                 # Environment variable template
├── requirements.txt             # Python dependencies
├── run.py                       # Application entry point
├── migrate_db.py                # Database schema migration utility
└── force_init_db.py             # Database reset utility
```

---

## API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/login` | Log in |
| `POST` | `/auth/register` | Register a new account |
| `GET` | `/auth/logout` | Log out |
| `GET` | `/auth/api/me` | Current user summary |
| `GET` | `/auth/api/profile` | Full profile data |
| `GET` | `/auth/api/csrf-token` | Get CSRF token |
| `POST` | `/auth/api/change-password` | Change password |
| `POST` | `/auth/forgot_password` | Request password reset email |

### Files

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/files/api/list` | List files (excludes deleted by default) |
| `GET` | `/files/api/list?show_deleted=true` | List only deleted files |
| `POST` | `/files/upload` | Upload a file |
| `GET` | `/files/download/<id>` | Download a file |
| `POST` | `/files/delete/<id>` | Soft-delete (move to trash) |
| `POST` | `/files/permanent-delete/<id>` | Permanently delete from disk |
| `POST` | `/files/restore/<id>` | Restore from trash |
| `POST` | `/files/tag/<id>` | Update file tags |
| `GET` | `/files/api/tags` | List all tags |
| `GET` | `/files/api/storage-info` | Storage usage, quota, tier, speed limits |
| `GET` | `/files/api/preview/<id>` | File preview metadata |
| `GET` | `/files/api/preview/<id>/content` | Stream file content for preview |
| `GET` | `/files/stream/<id>` | Video streaming (range requests) |
| `POST` | `/files/api/request-storage` | Request storage quota upgrade |

### Sharing

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/files/api/share/<id>` | Create a share link |
| `GET` | `/files/api/share/<id>/links` | List share links for a file |
| `POST` | `/files/api/share/revoke/<link_id>` | Revoke a share link |
| `GET` | `/s/<token>` | Public share page |
| `GET` | `/s/<token>/download` | Public download |

### File Versions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/files/api/versions/<id>` | Get version history |
| `POST` | `/files/api/versions/<id>/restore/<vid>` | Restore a previous version |
| `POST` | `/files/api/versions/<id>/delete/<vid>` | Delete a version |

### Notes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/notes` | List all notes |
| `POST` | `/api/notes` | Create a note |
| `GET` | `/api/notes/<id>` | Get a note |
| `PUT` | `/api/notes/<id>` | Update a note |
| `DELETE` | `/api/notes/<id>` | Delete a note |

### Trash

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/trash/` | List trashed files |
| `POST` | `/api/trash/restore/<id>` | Restore from trash |
| `DELETE` | `/api/trash/delete/<id>` | Permanently delete |
| `DELETE` | `/api/trash/empty` | Empty all trash |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/api/users` | List all users |
| `GET` | `/admin/api/stats` | Dashboard statistics |
| `GET` | `/admin/api/logs` | Paginated activity logs |
| `GET` | `/admin/api/logs/export` | Export logs as CSV |
| `GET` | `/admin/api/telemetry` | Activity chart data (30 days) |
| `GET` | `/admin/api/roles` | List all roles |
| `POST` | `/admin/api/roles` | Create a custom role |
| `PUT` | `/admin/api/roles/<id>` | Update a role |
| `DELETE` | `/admin/api/roles/<id>` | Delete a custom role |
| `POST` | `/admin/api/user/<id>/role` | Assign role to user |
| `POST` | `/admin/approve-user` | Approve or reject a user |
| `POST` | `/admin/delete-user` | Delete a user and all their data |

### Settings & Setup

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/setup/api/status` | Setup wizard completion status |
| `POST` | `/setup/api/complete` | Complete initial setup |
| `GET` | `/setup/api/settings` | Get all system settings |
| `POST` | `/setup/api/settings` | Update system settings |
| `GET` | `/setup/api/app-config` | Public application configuration |

---

## Development

### Frontend

```bash
cd frontend
npm install
npm run dev    # Vite dev server with hot module replacement
npm run build  # Production build → app/static/react/
```

### Backend

```bash
# Windows
set FLASK_DEBUG=1 && python run.py

# Linux/macOS
FLASK_DEBUG=1 python run.py
```

The server listens on `0.0.0.0:5000` by default, accessible from any device on the local network at `http://<server-ip>:5000`.

### Supported File Previews

| Type | Extensions |
|------|-----------|
| **Images** | jpg, jpeg, png, gif, webp, svg, bmp |
| **Documents** | pdf |
| **Video** | mp4, webm, ogg |
| **Audio** | mp3, wav, ogg, flac |
| **Text** | txt, md, json, log, csv, xml, html, css, js, py, yaml, yml |

### Blocked Extensions

Executable and script files are rejected on upload: `exe`, `bat`, `cmd`, `sh`, `ps1`, `vbs`, `js`, `reg`, `msi`, `com`, `scr`, `jar`, `lnk`, `inf`, `sys`, and others. The full list is in `app/config.py`.

### Running Tests

The backend ships with a pytest suite covering the security-critical paths
(share-link XSS escaping, sandbox CSP / `Content-Disposition` on served files,
password-strength policy, and the setup-wizard lockdown).

```bash
pip install -r requirements-dev.txt
python -m pytest tests/ -q
```

Tests run against an isolated temporary SQLite database and upload directory, so
they never touch real data.

---

## Production Deployment

### Docker (recommended)

The included `Dockerfile` and `docker-compose.yml` build the frontend, run the
app under Gunicorn, and start a Redis instance for rate limiting — all with one
command.

```bash
cp .env.example .env        # then edit secrets in .env
docker compose up -d --build
```

Open `http://localhost:5000` and complete the setup wizard. User files,
database, and logs are persisted to `./files`, `./instance`, and `./logs` on the
host. To use PostgreSQL instead of SQLite, uncomment the `postgres` service and
`DATABASE_URL` in `docker-compose.yml`.

### Gunicorn (Linux/macOS)

```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:8000 "app:create_app()"
```

### Waitress (Windows)

```bash
pip install waitress
waitress-serve --port=8000 --call app:create_app
```

### Security Checklist

- [ ] Set fixed `SECRET_KEY`, `WTF_CSRF_SECRET_KEY`, and `SECURITY_PASSWORD_SALT` in `.env`
- [ ] Change the default admin password after setup
- [ ] Enable HTTPS (Let's Encrypt, Caddy, or Nginx reverse proxy)
- [ ] Set `SESSION_COOKIE_SECURE=True` after enabling HTTPS
- [ ] Configure firewall — expose only port 5000 or 8000
- [ ] Set up automated backups for `files/` and the database
- [ ] Use PostgreSQL for deployments with 5+ concurrent users
- [ ] Restrict file system permissions on the storage directory

### Version & Updates

The current version is read from the `VERSION` file at the project root. When
`GITHUB_REPO` is set in `.env` (e.g. `myusername/nas-system`), the admin
dashboard will automatically check GitHub releases and show an **Update
available** banner when a newer release is published.

To publish a new release:

1. Bump the version in `VERSION`.
2. Commit and tag the release:
   ```bash
   git tag -a v1.1.0 -m "Release 1.1.0"
   git push origin v1.1.0
   ```
3. Create a GitHub release from the tag.
4. On each server, run the update script:
   - **Linux/macOS:** `bash update.sh`
   - **Windows:** `powershell -File update.ps1`

The update script backs up the SQLite database, pulls the latest code,
installs dependencies, rebuilds the frontend, runs migrations, and restarts
the application service.

---

## Troubleshooting

**Login or registration fails on mobile / LAN:**
Access via `http://` (not `https://`) unless TLS is configured. Clear browser cookies and check `logs/nas.log`.

**File upload fails:**
Verify the file is under 20 GB, the extension isn't blocked, and your storage quota isn't full (check Profile).

**CSRF token errors:**
Ensure cookies are enabled. Clear cache and hard-refresh (`Ctrl+Shift+R`). Check DevTools → Network for `/auth/api/csrf-token`.

**Database connection issues:**
If the external database is unreachable, the app automatically falls back to SQLite. Check `docker ps` and verify `DATABASE_URL` in `.env`.

**Theme not applying:**
Hard-refresh the page. If still broken, reset via Settings → Theme → Reset to Default.

---

## FAQ

**Do I need Docker?**
No. Docker is only needed if you want PostgreSQL or MySQL. SQLite works out of the box with zero configuration.

**Can I run this on a Raspberry Pi?**
Yes. The application includes performance tuning for low-power hardware. SQLite is recommended for Pi deployments.

**How do I back up my data?**
Copy the `files/` directory and your database file (`instance/nas.db` for SQLite, or `pg_dump` for PostgreSQL).

**Can multiple people use this simultaneously?**
Yes. Multi-user is supported with role-based access control. Use PostgreSQL for best performance with 5+ concurrent users.

**How do I reset the admin password?**
Use the password reset feature (requires email), or run `python force_init_db.py` to reset the database.

**Where are files stored?**
In the `files/users/<user_id>/` directory under the project root, organized by user.

---

## License

**Copyright © 2026. All rights reserved.**

This software is licensed for personal or commercial use by the purchaser only. Redistribution, resale, or sharing of the source code is strictly prohibited.

THIS SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. The author makes no guarantees regarding functionality, compatibility, or fitness for a particular purpose.

Bug fixes may be provided at the author's discretion. Feature updates and improvements may be released if there is sufficient demand. No specific timeline or commitment is guaranteed for either.
