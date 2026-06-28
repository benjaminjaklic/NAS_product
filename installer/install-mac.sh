#!/bin/bash
# NAS System Installer for macOS
# Run with: chmod +x install-mac.sh && ./install-mac.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE}     NAS SYSTEM - macOS INSTALLER${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# Default installation directory
INSTALL_DIR="$HOME/NAS-System"

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

# Check for Homebrew
check_homebrew() {
    echo -e "${BLUE}[1/7] Checking Homebrew...${NC}"
    if command -v brew &> /dev/null; then
        echo -e "${GREEN}    Homebrew found!${NC}"
    else
        echo -e "${YELLOW}    Homebrew not found. Installing...${NC}"
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        
        # Add Homebrew to PATH for Apple Silicon Macs
        if [ -f "/opt/homebrew/bin/brew" ]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
        fi
        echo -e "${GREEN}    Homebrew installed!${NC}"
    fi
}

# Check Python
check_python() {
    echo -e "${BLUE}[2/7] Checking Python...${NC}"
    if command -v python3 &> /dev/null; then
        PYTHON_VERSION=$(python3 --version 2>&1 | cut -d' ' -f2)
        echo -e "${GREEN}    Python $PYTHON_VERSION found!${NC}"
    else
        echo -e "${YELLOW}    Python not found. Installing via Homebrew...${NC}"
        brew install python@3.11
        echo -e "${GREEN}    Python installed!${NC}"
    fi
}

# Check Node.js
check_nodejs() {
    echo -e "${BLUE}[3/7] Checking Node.js...${NC}"
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version 2>&1)
        echo -e "${GREEN}    Node.js $NODE_VERSION found!${NC}"
    else
        echo -e "${YELLOW}    Node.js not found. Installing via Homebrew...${NC}"
        brew install node
        echo -e "${GREEN}    Node.js installed!${NC}"
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
        
        # Replace placeholder values (macOS sed requires '' after -i)
        sed -i '' "s/SECRET_KEY=change-me-to-a-random-secret-key/SECRET_KEY=$SECRET_KEY/" "$INSTALL_DIR/.env"
        sed -i '' "s/WTF_CSRF_SECRET_KEY=change-me-to-another-random-key/WTF_CSRF_SECRET_KEY=$CSRF_KEY/" "$INSTALL_DIR/.env"
        sed -i '' "s/SECURITY_PASSWORD_SALT=change-me-to-a-unique-salt/SECURITY_PASSWORD_SALT=$SALT/" "$INSTALL_DIR/.env"
        
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

# Create start/stop scripts and app
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
    
    # Create macOS Application bundle
    APP_DIR="$HOME/Applications/NAS System.app"
    mkdir -p "$APP_DIR/Contents/MacOS"
    mkdir -p "$APP_DIR/Contents/Resources"
    
    # Create Info.plist
    cat > "$APP_DIR/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>NASSystem</string>
    <key>CFBundleIdentifier</key>
    <string>com.nassystem.app</string>
    <key>CFBundleName</key>
    <string>NAS System</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
</dict>
</plist>
EOF
    
    # Create launcher script
    cat > "$APP_DIR/Contents/MacOS/NASSystem" << EOF
#!/bin/bash
cd "$INSTALL_DIR"
source venv/bin/activate
open "http://localhost:5000"
python run.py
EOF
    chmod +x "$APP_DIR/Contents/MacOS/NASSystem"
    
    # Create launchd plist for auto-start (optional)
    PLIST_DIR="$HOME/Library/LaunchAgents"
    mkdir -p "$PLIST_DIR"
    
    cat > "$PLIST_DIR/com.nassystem.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.nassystem</string>
    <key>ProgramArguments</key>
    <array>
        <string>$INSTALL_DIR/venv/bin/python</string>
        <string>$INSTALL_DIR/run.py</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$INSTALL_DIR</string>
    <key>RunAtLoad</key>
    <false/>
    <key>KeepAlive</key>
    <false/>
</dict>
</plist>
EOF
    
    echo -e "${GREEN}    Scripts and app created!${NC}"
}

# Main installation
main() {
    check_homebrew
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
    echo ""
    echo -e "  ${YELLOW}Option 1:${NC} Double-click 'NAS System' in ~/Applications"
    echo ""
    echo -e "  ${YELLOW}Option 2:${NC} Run from terminal:"
    echo -e "           ${BLUE}$INSTALL_DIR/start-nas.sh${NC}"
    echo ""
    echo -e "  ${YELLOW}Option 3:${NC} Enable auto-start on login:"
    echo -e "           ${BLUE}launchctl load ~/Library/LaunchAgents/com.nassystem.plist${NC}"
    echo ""
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
        
        # Open browser
        open "http://localhost:5000/setup"
        
        echo ""
        echo -e "${GREEN}NAS System is running!${NC}"
        echo "Your browser should open automatically."
        echo "If not, go to: http://localhost:5000"
    fi
}

# Run main
main
