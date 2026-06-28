# NAS System Update Script
# Usage: .\update.ps1
# This pulls the latest release from the configured git remote, backs up
# the database, installs dependencies, runs migrations, rebuilds the
# frontend, and restarts the application service.

param(
    [string]$ServiceName = "NAS-System"
)

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackupDir = Join-Path $ProjectDir "backups"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

Write-Host "Updating NAS System in $ProjectDir..."

Set-Location $ProjectDir

# Ensure we are in a git repository.
try {
    $null = git rev-parse --git-dir 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Not a git repository"
    }
} catch {
    Write-Error "Error: $ProjectDir is not a git repository."
    exit 1
}

# Backup SQLite database if it exists.
$DbFile = Join-Path $ProjectDir "nas.db"
if (Test-Path $DbFile) {
    New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
    $BackupFile = Join-Path $BackupDir "nas_$Timestamp.db"
    Copy-Item -Path $DbFile -Destination $BackupFile
    Write-Host "Database backed up to $BackupFile"
}

# Show current version.
$VersionFile = Join-Path $ProjectDir "VERSION"
if (Test-Path $VersionFile) {
    Write-Host "Current version: $((Get-Content $VersionFile).Trim())"
}

# Pull latest changes.
Write-Host "Pulling latest changes..."
$CurrentBranch = (git branch --show-current 2>&1)
git fetch origin
git pull origin $CurrentBranch

# Install / upgrade Python dependencies.
$RequirementsFile = Join-Path $ProjectDir "requirements.txt"
if (Test-Path $RequirementsFile) {
    Write-Host "Installing Python dependencies..."
    $VenvPip = Join-Path $ProjectDir "venv\Scripts\pip.exe"
    if (Test-Path $VenvPip) {
        & $VenvPip install -r $RequirementsFile
    } else {
        pip install -r $RequirementsFile
    }
}

# Install / upgrade Node dependencies and rebuild frontend.
$FrontendDir = Join-Path $ProjectDir "frontend"
if (Test-Path $FrontendDir) {
    Write-Host "Building frontend..."
    Set-Location $FrontendDir
    npm install
    npm run build
    Set-Location $ProjectDir
}

# Run database migrations if a migration script exists.
$MigrateScript = Join-Path $ProjectDir "migrate_db.py"
if (Test-Path $MigrateScript) {
    Write-Host "Running database migrations..."
    $VenvPython = Join-Path $ProjectDir "venv\Scripts\python.exe"
    if (Test-Path $VenvPython) {
        & $VenvPython $MigrateScript
    } else {
        python $MigrateScript
    }
}

# Restart the application service if it exists.
try {
    $service = Get-Service -Name $ServiceName -ErrorAction Stop
    Write-Host "Restarting service $ServiceName..."
    Restart-Service -Name $ServiceName
} catch {
    Write-Host "No service '$ServiceName' found. Please restart the application manually."
}

if (Test-Path $VersionFile) {
    Write-Host "Updated to version: $((Get-Content $VersionFile).Trim())"
}

Write-Host "Update complete."
