#!/bin/bash
# NAS System Uninstaller for macOS
# Run with: chmod +x uninstall-mac.sh && ./uninstall-mac.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${RED}============================================${NC}"
echo -e "${RED}     NAS SYSTEM - macOS UNINSTALLER${NC}"
echo -e "${RED}============================================${NC}"
echo ""

DEFAULT_DIR="$HOME/NAS-System"

read -p "Enter installation directory [$DEFAULT_DIR]: " INSTALL_DIR
INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_DIR}"

if [ ! -d "$INSTALL_DIR" ]; then
    echo -e "${RED}[!] Directory not found: $INSTALL_DIR${NC}"
    exit 1
fi

echo ""
echo -e "${YELLOW}WARNING: This will delete:${NC}"
echo "  - All application files in $INSTALL_DIR"
echo "  - NAS System.app from ~/Applications"
echo "  - LaunchAgent (auto-start configuration)"
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

# Unload and remove LaunchAgent
if [ -f "$HOME/Library/LaunchAgents/com.nassystem.plist" ]; then
    echo "Removing LaunchAgent..."
    launchctl unload "$HOME/Library/LaunchAgents/com.nassystem.plist" 2>/dev/null || true
    rm -f "$HOME/Library/LaunchAgents/com.nassystem.plist"
    echo -e "${GREEN}[✓] LaunchAgent removed${NC}"
fi

# Remove app bundle
if [ -d "$HOME/Applications/NAS System.app" ]; then
    echo "Removing application..."
    rm -rf "$HOME/Applications/NAS System.app"
    echo -e "${GREEN}[✓] Application removed${NC}"
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
