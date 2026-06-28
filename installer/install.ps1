# NAS System Windows Installer Script
# Run as Administrator: powershell -ExecutionPolicy Bypass -File install.ps1

param(
    [string]$InstallPath = "C:\NASSystem",
    [switch]$SkipPython,
    [switch]$SkipNode,
    [switch]$Silent
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "`n=== $Message ===" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[!] $Message" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Message)
    Write-Host "[X] $Message" -ForegroundColor Red
}

# Banner
Write-Host @"

    _   _    _    ____    ____            _                 
   | \ | |  / \  / ___|  / ___| _   _ ___| |_ ___ _ __ ___  
   |  \| | / _ \ \___ \  \___ \| | | / __| __/ _ \ '_ ` _ \ 
   | |\  |/ ___ \ ___) |  ___) | |_| \__ \ ||  __/ | | | | |
   |_| \_/_/   \_\____/  |____/ \__, |___/\__\___|_| |_| |_|
                                |___/                       
                        INSTALLER v1.0

"@ -ForegroundColor Magenta

Write-Host "This installer will set up NAS System on your computer."
Write-Host ""

if (-not $Silent) {
    Write-Host "Default installation path: C:\NASSystem"
    $customPath = Read-Host "Enter custom installation path (or press Enter for default)"
    if ($customPath -ne "") {
        $InstallPath = $customPath
    }
    
    Write-Host ""
    Write-Host "Installation path: $InstallPath" -ForegroundColor Yellow
    Write-Host ""
    
    $confirm = Read-Host "Continue with installation? (Y/n)"
    if ($confirm -eq "n" -or $confirm -eq "N") {
        Write-Host "Installation cancelled."
        exit 0
    }
}

# Check if running as admin
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Warn "Not running as Administrator. Some features may not work."
}

# Step 1: Check Python
Write-Step "Checking Python Installation"
$pythonPath = $null
try {
    $pythonVersion = python --version 2>&1
    if ($pythonVersion -match "Python 3\.(\d+)") {
        $minorVersion = [int]$Matches[1]
        if ($minorVersion -ge 9) {
            Write-Success "Python $pythonVersion found"
            $pythonPath = (Get-Command python).Source
        } else {
            Write-Warn "Python 3.9+ required, found $pythonVersion"
        }
    }
} catch {
    Write-Warn "Python not found in PATH"
}

if (-not $pythonPath -and -not $SkipPython) {
    Write-Step "Installing Python 3.11"
    $pythonUrl = "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe"
    $pythonInstaller = "$env:TEMP\python-installer.exe"
    
    Write-Host "Downloading Python..."
    Invoke-WebRequest -Uri $pythonUrl -OutFile $pythonInstaller
    
    Write-Host "Installing Python (this may take a few minutes)..."
    Start-Process -FilePath $pythonInstaller -ArgumentList "/quiet", "InstallAllUsers=1", "PrependPath=1" -Wait
    Remove-Item $pythonInstaller -Force
    
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    Write-Success "Python installed"
}

# Step 2: Check Node.js
Write-Step "Checking Node.js Installation"
$nodePath = $null
try {
    $nodeVersion = node --version 2>&1
    if ($nodeVersion -match "v(\d+)\.") {
        $majorVersion = [int]$Matches[1]
        if ($majorVersion -ge 18) {
            Write-Success "Node.js $nodeVersion found"
            $nodePath = (Get-Command node).Source
        } else {
            Write-Warn "Node.js 18+ required, found $nodeVersion"
        }
    }
} catch {
    Write-Warn "Node.js not found in PATH"
}

if (-not $nodePath -and -not $SkipNode) {
    Write-Step "Installing Node.js 20 LTS"
    $nodeUrl = "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"
    $nodeInstaller = "$env:TEMP\node-installer.msi"
    
    Write-Host "Downloading Node.js..."
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstaller
    
    Write-Host "Installing Node.js..."
    Start-Process -FilePath "msiexec.exe" -ArgumentList "/i", $nodeInstaller, "/quiet", "/norestart" -Wait
    Remove-Item $nodeInstaller -Force
    
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    Write-Success "Node.js installed"
}

# Step 3: Create installation directory
Write-Step "Creating Installation Directory"
if (Test-Path $InstallPath) {
    Write-Warn "Directory exists. Files will be updated."
} else {
    New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
}
Write-Success "Directory ready: $InstallPath"

# Step 4: Copy application files
Write-Step "Copying Application Files"
$sourceDir = Split-Path -Parent $PSScriptRoot
Copy-Item -Path "$sourceDir\*" -Destination $InstallPath -Recurse -Force -Exclude @("installer", ".git", "node_modules", "__pycache__", "*.pyc", ".env")
Write-Success "Files copied"

# Step 5: Create .env configuration
Write-Step "Creating Environment Configuration"
if (-not (Test-Path "$InstallPath\.env")) {
    Copy-Item "$InstallPath\.env.example" "$InstallPath\.env" -Force
    
    # Generate secure random keys
    $secretKey = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
    $csrfKey = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
    $salt = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
    
    # Replace placeholder values
    $envContent = Get-Content "$InstallPath\.env" -Raw
    $envContent = $envContent -replace 'SECRET_KEY=change-me-to-a-random-secret-key', "SECRET_KEY=$secretKey"
    $envContent = $envContent -replace 'WTF_CSRF_SECRET_KEY=change-me-to-another-random-key', "WTF_CSRF_SECRET_KEY=$csrfKey"
    $envContent = $envContent -replace 'SECURITY_PASSWORD_SALT=change-me-to-a-unique-salt', "SECURITY_PASSWORD_SALT=$salt"
    Set-Content "$InstallPath\.env" $envContent
    
    Write-Success ".env created with secure keys"
} else {
    Write-Warn ".env already exists — skipping"
}

# Step 6: Create virtual environment
Write-Step "Setting Up Python Environment"
Set-Location $InstallPath
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r requirements.txt
Write-Success "Python dependencies installed"

# Step 7: Build React frontend
Write-Step "Building Frontend"
Set-Location "$InstallPath\frontend"
npm install
npm run build
Set-Location $InstallPath
Write-Success "Frontend built"

# Step 8: Create directories
Write-Step "Creating Data Directories"
$dirs = @("files\users", "files\shared", "files\system", "files\tmp", "logs", "instance")
foreach ($dir in $dirs) {
    New-Item -ItemType Directory -Path "$InstallPath\$dir" -Force | Out-Null
}
Write-Success "Directories created"

# Step 9: Create start scripts
Write-Step "Creating Startup Scripts"

# Start script
@"
@echo off
cd /d "$InstallPath"
call venv\Scripts\activate.bat
python run.py
pause
"@ | Out-File -FilePath "$InstallPath\Start-NAS.bat" -Encoding ASCII

# Desktop shortcut
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\NAS System.lnk")
$Shortcut.TargetPath = "$InstallPath\Start-NAS.bat"
$Shortcut.WorkingDirectory = $InstallPath
$Shortcut.IconLocation = "$InstallPath\app\static\favicon.ico"
$Shortcut.Save()

Write-Success "Startup scripts created"

# Step 10: Create Windows service (optional)
Write-Step "Windows Service Setup"
Write-Host "Would you like to install NAS System as a Windows service?"
Write-Host "This allows it to start automatically with Windows."
if (-not $Silent) {
    $installService = Read-Host "Install as service? (y/N)"
    if ($installService -eq "y" -or $installService -eq "Y") {
        # Create service wrapper using NSSM
        $nssmUrl = "https://nssm.cc/release/nssm-2.24.zip"
        $nssmZip = "$env:TEMP\nssm.zip"
        $nssmDir = "$env:TEMP\nssm"
        
        Write-Host "Downloading NSSM..."
        Invoke-WebRequest -Uri $nssmUrl -OutFile $nssmZip
        Expand-Archive -Path $nssmZip -DestinationPath $nssmDir -Force
        
        $nssm = "$nssmDir\nssm-2.24\win64\nssm.exe"
        
        & $nssm install NASSystem "$InstallPath\venv\Scripts\python.exe" "$InstallPath\run.py"
        & $nssm set NASSystem AppDirectory $InstallPath
        & $nssm set NASSystem DisplayName "NAS System"
        & $nssm set NASSystem Description "Personal NAS File Management System"
        & $nssm set NASSystem Start SERVICE_AUTO_START
        
        Write-Success "Windows service installed"
        Write-Host "Start the service with: net start NASSystem"
    }
}

# Complete
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   INSTALLATION COMPLETE!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Installation path: $InstallPath"
Write-Host ""
Write-Host "To start NAS System:"
Write-Host "  1. Double-click 'NAS System' on your desktop"
Write-Host "  2. Or run: $InstallPath\Start-NAS.bat"
Write-Host ""
Write-Host "Then open: http://localhost:5000"
Write-Host ""
Write-Host "The setup wizard will guide you through:"
Write-Host "  - Creating admin account"
Write-Host "  - Configuring storage"
Write-Host "  - Setting up email (optional)"
Write-Host ""

if (-not $Silent) {
    $startNow = Read-Host "Start NAS System now? (Y/n)"
    if ($startNow -ne "n" -and $startNow -ne "N") {
        Start-Process "$InstallPath\Start-NAS.bat"
        Start-Sleep -Seconds 3
        Start-Process "http://localhost:5000/setup"
    }
}
