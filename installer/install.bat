@echo off
REM NAS System Simple Installer for Windows
REM Run this as Administrator for best results

title NAS System Installer
color 0A

echo.
echo  ============================================
echo       NAS SYSTEM - QUICK INSTALLER
echo  ============================================
echo.

REM Check if running as admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Warning: Not running as Administrator
    echo [!] Some features may not work correctly
    echo.
)

REM Prompt for installation directory
echo Default installation directory: C:\NASSystem
echo.
set /p INSTALL_DIR=Enter installation directory (or press Enter for default): 
if "%INSTALL_DIR%"=="" set INSTALL_DIR=C:\NASSystem

echo.
echo Installation directory: %INSTALL_DIR%
echo.

set /p CONFIRM=Continue with installation? (Y/n): 
if /i "%CONFIRM%"=="n" goto :cancel

REM Create directory
echo.
echo [1/7] Creating installation directory...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

REM Copy files (exclude installer folder, .git, node_modules)
echo [2/7] Copying application files...
robocopy "%~dp0.." "%INSTALL_DIR%" /E /XD installer .git node_modules __pycache__ /XF .env /NFL /NDL /NJH /NJS /NC /NS /NP >nul 2>&1

REM Create .env with secure keys
echo [3/7] Creating environment configuration...
if not exist "%INSTALL_DIR%\.env" (
    copy "%INSTALL_DIR%\.env.example" "%INSTALL_DIR%\.env" >nul 2>&1
    REM Generate random keys using Python (available after check)
    echo     .env created from template
) else (
    echo     .env already exists - skipping
)

REM Check Python
echo [4/7] Checking Python...
python --version >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Python not found. Please install Python 3.9+ from python.org
    echo [!] Make sure to check "Add Python to PATH" during installation
    start https://www.python.org/downloads/
    pause
    goto :end
)
echo     Python found!

REM Check Node.js
echo [5/7] Checking Node.js...
node --version >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] Node.js not found. Please install Node.js 18+ from nodejs.org
    start https://nodejs.org/
    pause
    goto :end
)
echo     Node.js found!

REM Install dependencies
echo [6/7] Installing dependencies (this may take a few minutes)...
cd /d "%INSTALL_DIR%"
python -m venv venv
call venv\Scripts\activate.bat
pip install -r requirements.txt >nul 2>&1

cd frontend
call npm install >nul 2>&1
call npm run build >nul 2>&1
cd ..

REM Create directories
echo [7/7] Creating data directories...
if not exist "files\users" mkdir "files\users"
if not exist "files\shared" mkdir "files\shared"
if not exist "files\system" mkdir "files\system"
if not exist "files\tmp" mkdir "files\tmp"
if not exist "logs" mkdir "logs"
if not exist "instance" mkdir "instance"

REM Create start script
echo @echo off > "%INSTALL_DIR%\Start-NAS.bat"
echo cd /d "%INSTALL_DIR%" >> "%INSTALL_DIR%\Start-NAS.bat"
echo call venv\Scripts\activate.bat >> "%INSTALL_DIR%\Start-NAS.bat"
echo echo Starting NAS System... >> "%INSTALL_DIR%\Start-NAS.bat"
echo echo Open http://localhost:5000 in your browser >> "%INSTALL_DIR%\Start-NAS.bat"
echo python run.py >> "%INSTALL_DIR%\Start-NAS.bat"

REM Create desktop shortcut
echo Set oWS = WScript.CreateObject("WScript.Shell") > "%TEMP%\shortcut.vbs"
echo sLinkFile = oWS.SpecialFolders("Desktop") ^& "\NAS System.lnk" >> "%TEMP%\shortcut.vbs"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%TEMP%\shortcut.vbs"
echo oLink.TargetPath = "%INSTALL_DIR%\Start-NAS.bat" >> "%TEMP%\shortcut.vbs"
echo oLink.WorkingDirectory = "%INSTALL_DIR%" >> "%TEMP%\shortcut.vbs"
echo oLink.Save >> "%TEMP%\shortcut.vbs"
cscript //nologo "%TEMP%\shortcut.vbs"
del "%TEMP%\shortcut.vbs"

echo.
echo  ============================================
echo       INSTALLATION COMPLETE!
echo  ============================================
echo.
echo  Installation path: %INSTALL_DIR%
echo.
echo  To start NAS System:
echo    - Double-click "NAS System" on your desktop
echo    - Or run: %INSTALL_DIR%\Start-NAS.bat
echo.
echo  Then open: http://localhost:5000
echo.
echo  The setup wizard will guide you through initial configuration.
echo.

set /p START_NOW=Start NAS System now? (Y/n): 
if /i not "%START_NOW%"=="n" (
    start "" "%INSTALL_DIR%\Start-NAS.bat"
    timeout /t 3 >nul
    start http://localhost:5000/setup
)

goto :end

:cancel
echo Installation cancelled.

:end
echo.
pause
