#!/usr/bin/env bash
set -euo pipefail

# NAS System Update Script
# Usage: ./update.sh
# This pulls the latest release from the configured git remote, backs up
# the database, installs dependencies, runs migrations, rebuilds the
# frontend, and restarts the application service.

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${PROJECT_DIR}/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "Updating NAS System in ${PROJECT_DIR}..."

cd "${PROJECT_DIR}"

# Ensure we are in a git repository.
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "Error: ${PROJECT_DIR} is not a git repository."
    exit 1
fi

# Backup SQLite database if it exists.
DB_FILE="${PROJECT_DIR}/nas.db"
if [ -f "${DB_FILE}" ]; then
    mkdir -p "${BACKUP_DIR}"
    BACKUP_FILE="${BACKUP_DIR}/nas_${TIMESTAMP}.db"
    cp "${DB_FILE}" "${BACKUP_FILE}"
    echo "Database backed up to ${BACKUP_FILE}"
fi

# Show current version.
if [ -f "${PROJECT_DIR}/VERSION" ]; then
    echo "Current version: $(cat "${PROJECT_DIR}/VERSION")"
fi

# Pull latest changes.
echo "Pulling latest changes..."
git fetch origin
git pull origin "$(git branch --show-current)"

# Install / upgrade Python dependencies.
if [ -f "requirements.txt" ]; then
    echo "Installing Python dependencies..."
    if [ -d "venv" ]; then
        ./venv/bin/pip install -r requirements.txt
    else
        pip install -r requirements.txt
    fi
fi

# Install / upgrade Node dependencies and rebuild frontend.
if [ -d "frontend" ]; then
    echo "Building frontend..."
    cd frontend
    npm install
    npm run build
    cd "${PROJECT_DIR}"
fi

# Run database migrations if a migration script exists.
if [ -f "migrate_db.py" ]; then
    echo "Running database migrations..."
    if [ -d "venv" ]; then
        ./venv/bin/python migrate_db.py
    else
        python migrate_db.py
    fi
fi

# Restart the application if it is managed by systemd.
SERVICE_NAME="nas-system"
if systemctl list-units --type=service | grep -q "${SERVICE_NAME}.service"; then
    echo "Restarting ${SERVICE_NAME} service..."
    sudo systemctl restart "${SERVICE_NAME}"
else
    echo "No systemd service '${SERVICE_NAME}' found. Please restart the application manually."
fi

if [ -f "${PROJECT_DIR}/VERSION" ]; then
    echo "Updated to version: $(cat "${PROJECT_DIR}/VERSION")"
fi

echo "Update complete."
