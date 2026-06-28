#!/bin/bash
# NAS System Installer for Linux (Ubuntu/Debian/CentOS/Fedora)
# Run with: chmod +x install-linux.sh && ./install-linux.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}     NAS SYSTEM - LINUX INSTALLER${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${YELLOW}[!] Running as root. Will install system-wide.${NC}"
    INSTALL_DIR="/opt/nas-system"
    SERVICE_INSTALL=true
else
    echo -e "${YELLOW}[!] Not running as root. Installing to home directory.${NC}"
    echo -e "${YELLOW}[!] Run with 'sudo' for system-wide installation.${NC}"
    INSTALL_DIR="$HOME/nas-system"
    SERVICE_INSTALL=false
fi

echo ""
echo -e "Default installation directory: ${GREEN}$INSTALL_DIR${NC}"
echo ""
read -p "Enter installation directory (or press Enter for default): " CUSTOM_DIR
if [ -n "$CUSTOM_DIR" ]; then
    INSTALL_DIR="$CUSTOM_DIR"
fi

echo ""
echo -e "Installation directory: ${GREEN}$INSTALL_DIR${NC}"
echo ""
read -p "Continue with installation? (Y/n): " CONFIRM
if [ "$CONFIRM" = "n" ] || [ "$CONFIRM" = "N" ]; then
    echo "Installation cancelled."
    exit 0
fi

# Detect package manager
detect_package_manager() {
    if command -v apt-get &> /dev/null; then
        PKG_MANAGER="apt-get"
        PKG_UPDATE="apt-get update"
        PKG_INSTALL="apt-get install -y"
    elif command -v dnf &> /dev/null; then
        PKG_MANAGER="dnf"
        PKG_UPDATE="dnf check-update || true"
        PKG_INSTALL="dnf install -y"
    elif command -v yum &> /dev/null; then
        PKG_MANAGER="yum"
        PKG_UPDATE="yum check-update || true"
        PKG_INSTALL="yum install -y"
    elif command -v pacman &> /dev/null; then
        PKG_MANAGER="pacman"
        PKG_UPDATE="pacman -Sy"
        PKG_INSTALL="pacman -S --noconfirm"
    else
        echo -e "${RED}[!] No supported package manager found${NC}"
        exit 1
    fi
    echo -e "${GREEN}[✓] Detected package manager: $PKG_MANAGER${NC}"
}

# Install dependencies
install_dependencies() {
    echo ""
    echo -e "${BLUE}[1/7] Installing system dependencies...${NC}"
    
    if [ "$EUID" -eq 0 ]; then
        $PKG_UPDATE
        
        case $PKG_MANAGER in
            apt-get)
                $PKG_INSTALL python3 python3-pip python3-venv nodejs npm git curl
                ;;
            dnf|yum)
                $PKG_INSTALL python3 python3-pip nodejs npm git curl
                ;;
            pacman)
                $PKG_INSTALL python python-pip nodejs npm git curl
                ;;
        esac
        echo -e "${GREEN}    Dependencies installed!${NC}"
    else
        echo -e "${YELLOW}    Skipping system packages (not root). Checking if already installed...${NC}"
    fi
}

# Check Python
check_python() {
    echo -e "${BLUE}[2/7] Checking Python...${NC}"
    if command -v python3 &> /dev/null; then
        PYTHON_VERSION=$(python3 --version 2>&1 | cut -d' ' -f2)
        echo -e "${GREEN}    Python $PYTHON_VERSION found!${NC}"
    else
        echo -e "${RED}[!] Python 3 not found. Please install Python 3.9+${NC}"
        echo "    Ubuntu/Debian: sudo apt install python3 python3-pip python3-venv"
        echo "    CentOS/Fedora: sudo dnf install python3 python3-pip"
        exit 1
    fi
}

# Check Node.js
check_nodejs() {
    echo -e "${BLUE}[3/7] Checking Node.js...${NC}"
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version 2>&1)
        echo -e "${GREEN}    Node.js $NODE_VERSION found!${NC}"
    else
        echo -e "${RED}[!] Node.js not found. Please install Node.js 18+${NC}"
        echo "    Ubuntu/Debian: sudo apt install nodejs npm"
        echo "    Or use: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
        exit 1
    fi
}

# Create installation directory
create_directories() {
    echo -e "${BLUE}[4/7] Creating installation directory...${NC}"
    mkdir -p "$INSTALL_DIR"
    
    # Copy files from script location
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PARENT_DIR="$(dirname "$SCRIPT_DIR")"
    
    echo "    Copying application files..."
    cp -r "$PARENT_DIR"/* "$INSTALL_DIR/" 2>/dev/null || true
    
    # Create data directories
    mkdir -p "$INSTALL_DIR/files/users"
    mkdir -p "$INSTALL_DIR/files/shared"
    mkdir -p "$INSTALL_DIR/files/system"
    mkdir -p "$INSTALL_DIR/files/tmp"
    mkdir -p "$INSTALL_DIR/logs"
    mkdir -p "$INSTALL_DIR/instance"
    
    echo -e "${GREEN}    Directories created!${NC}"
}

# Create .env configuration
create_env() {
    echo -e "${BLUE}[5/8] Creating environment configuration...${NC}"
    if [ ! -f "$INSTALL_DIR/.env" ]; then
        cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
        
        # Generate secure random keys using Python
        SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
        CSRF_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
        SALT=$(python3 -c "import secrets; print(secrets.token_hex(16))")
        
        # Replace placeholder values
        sed -i "s/SECRET_KEY=change-me-to-a-random-secret-key/SECRET_KEY=$SECRET_KEY/" "$INSTALL_DIR/.env"
        sed -i "s/WTF_CSRF_SECRET_KEY=change-me-to-another-random-key/WTF_CSRF_SECRET_KEY=$CSRF_KEY/" "$INSTALL_DIR/.env"
        sed -i "s/SECURITY_PASSWORD_SALT=change-me-to-a-unique-salt/SECURITY_PASSWORD_SALT=$SALT/" "$INSTALL_DIR/.env"
        
        echo -e "${GREEN}    .env created with secure keys!${NC}"
    else
        echo -e "${YELLOW}    .env already exists — skipping${NC}"
    fi
}

# Setup Python virtual environment
setup_python() {
    echo -e "${BLUE}[6/8] Setting up Python environment...${NC}"
    cd "$INSTALL_DIR"
    
    python3 -m venv venv
    source venv/bin/activate
    pip install --upgrade pip > /dev/null 2>&1
    pip install -r requirements.txt > /dev/null 2>&1
    
    echo -e "${GREEN}    Python dependencies installed!${NC}"
}

# Build frontend
build_frontend() {
    echo -e "${BLUE}[7/8] Building frontend...${NC}"
    cd "$INSTALL_DIR/frontend"
    
    npm install > /dev/null 2>&1
    npm run build > /dev/null 2>&1
    
    echo -e "${GREEN}    Frontend built!${NC}"
}

# Create start/stop scripts
create_scripts() {
    echo -e "${BLUE}[8/8] Creating management scripts...${NC}"
    
    # Start script
    cat > "$INSTALL_DIR/start-nas.sh" << 'EOF'
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
source venv/bin/activate
echo "Starting NAS System..."
echo "Open http://localhost:5000 in your browser"
echo "Press Ctrl+C to stop"
python run.py
EOF
    chmod +x "$INSTALL_DIR/start-nas.sh"
    
    # Stop script
    cat > "$INSTALL_DIR/stop-nas.sh" << 'EOF'
#!/bin/bash
pkill -f "python run.py" || echo "NAS System is not running"
echo "NAS System stopped"
EOF
    chmod +x "$INSTALL_DIR/stop-nas.sh"
    
    # Create systemd service if root
    if [ "$EUID" -eq 0 ] && [ "$SERVICE_INSTALL" = true ]; then
        cat > /etc/systemd/system/nas-system.service << EOF
[Unit]
Description=NAS System
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/venv/bin/python $INSTALL_DIR/run.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
        systemctl daemon-reload
        echo -e "${GREEN}    Systemd service created!${NC}"
        echo -e "${GREEN}    Enable with: sudo systemctl enable nas-system${NC}"
    fi
    
    echo -e "${GREEN}    Scripts created!${NC}"
}

# Main installation
main() {
    detect_package_manager
    install_dependencies
    check_python
    check_nodejs
    create_directories
    create_env
    setup_python
    build_frontend
    create_scripts
    
    echo ""
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}     INSTALLATION COMPLETE!${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo ""
    echo -e "  Installation path: ${BLUE}$INSTALL_DIR${NC}"
    echo ""
    echo "  To start NAS System:"
    echo -e "    ${YELLOW}$INSTALL_DIR/start-nas.sh${NC}"
    echo ""
    if [ "$EUID" -eq 0 ]; then
        echo "  Or use systemd:"
        echo -e "    ${YELLOW}sudo systemctl start nas-system${NC}"
        echo -e "    ${YELLOW}sudo systemctl enable nas-system${NC}  (auto-start on boot)"
        echo ""
    fi
    echo "  Then open: http://localhost:5000"
    echo ""
    echo "  The setup wizard will guide you through initial configuration."
    echo ""
    
    read -p "Start NAS System now? (Y/n): " START_NOW
    if [ "$START_NOW" != "n" ] && [ "$START_NOW" != "N" ]; then
        echo ""
        echo "Starting NAS System..."
        cd "$INSTALL_DIR"
        source venv/bin/activate
        python run.py &
        sleep 3
        
        # Try to open browser
        if command -v xdg-open &> /dev/null; then
            xdg-open "http://localhost:5000/setup" 2>/dev/null || true
        fi
        
        echo ""
        echo -e "${GREEN}NAS System is running!${NC}"
        echo "Open http://localhost:5000 in your browser"
    fi
}

# Run main
main
