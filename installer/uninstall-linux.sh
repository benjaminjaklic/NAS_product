#!/bin/bash
# NAS System Uninstaller for Linux
# Run with: chmod +x uninstall-linux.sh && ./uninstall-linux.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${RED}============================================${NC}"
echo -e "${RED}     NAS SYSTEM - LINUX UNINSTALLER${NC}"
echo -e "${RED}============================================${NC}"
echo ""

# Default paths
if [ "$EUID" -eq 0 ]; then
    DEFAULT_DIR="/opt/nas-system"
else
    DEFAULT_DIR="$HOME/nas-system"
fi

read -p "Enter installation directory [$DEFAULT_DIR]: " INSTALL_DIR
INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_DIR}"

if [ ! -d "$INSTALL_DIR" ]; then
    echo -e "${RED}[!] Directory not found: $INSTALL_DIR${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}WARNING: This will delete:${NC}"
echo "  - All application files in $INSTALL_DIR"
echo "  - Systemd service (if installed)"
echo ""
echo -e "${YELLOW}Your data (files, database) will be deleted!${NC}"
echo ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Uninstallation cancelled."
    exit 0
fi

# Backup option
echo ""
read -p "Backup your data before uninstalling? (Y/n): " BACKUP
if [ "$BACKUP" != "n" ] && [ "$BACKUP" != "N" ]; then
    BACKUP_DIR="$HOME/nas-backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    
    if [ -d "$INSTALL_DIR/files" ]; then
        cp -r "$INSTALL_DIR/files" "$BACKUP_DIR/"
    fi
    if [ -d "$INSTALL_DIR/instance" ]; then
        cp -r "$INSTALL_DIR/instance" "$BACKUP_DIR/"
    fi
    
    echo -e "${GREEN}[✓] Backup saved to: $BACKUP_DIR${NC}"
fi

echo ""
echo "Stopping NAS System..."
pkill -f "python run.py" 2>/dev/null || true

# Remove systemd service
if [ "$EUID" -eq 0 ] && [ -f "/etc/systemd/system/nas-system.service" ]; then
    echo "Removing systemd service..."
    systemctl stop nas-system 2>/dev/null || true
    systemctl disable nas-system 2>/dev/null || true
    rm -f /etc/systemd/system/nas-system.service
    systemctl daemon-reload
    echo -e "${GREEN}[✓] Systemd service removed${NC}"
fi

# Remove installation directory
echo "Removing installation directory..."
rm -rf "$INSTALL_DIR"
echo -e "${GREEN}[✓] Installation directory removed${NC}"

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}     UNINSTALLATION COMPLETE${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
if [ -n "$BACKUP_DIR" ]; then
    echo -e "Your backup is at: ${BLUE}$BACKUP_DIR${NC}"
fi
echo ""
