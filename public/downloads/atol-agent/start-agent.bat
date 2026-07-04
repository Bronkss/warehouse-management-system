@echo off
setlocal EnableExtensions
title ATOL Local Agent Driver 10.10

set "AGENT_DIR=%~dp0"
cd /d "%AGENT_DIR%" || (
    echo ERROR: cannot open agent folder: "%AGENT_DIR%"
    pause
    exit /b 1
)

echo.
echo ================================================
echo ATOL Local Agent Driver 10.10
echo Folder: %CD%
echo ================================================
echo.

if not exist "server.js" (
    echo ERROR: server.js not found near start-agent.bat
    echo Current folder files:
    dir /b
    pause
    exit /b 1
)

if not exist "package.json" (
    echo ERROR: package.json not found near start-agent.bat
    echo Current folder files:
    dir /b
    pause
    exit /b 1
)

if not exist "bridge\atol-json.ps1" (
    echo ERROR: bridge\atol-json.ps1 not found
    echo Expected structure:
    echo   server.js
    echo   package.json
    echo   start-agent.bat
    echo   .env or env.txt
    echo   bridge\atol-json.ps1
    pause
    exit /b 1
)

if not exist ".env" (
    if exist "env.txt" (
        echo Found env.txt. Copying to .env ...
        copy /Y "env.txt" ".env" >nul
    )
)

if not exist ".env" (
    echo .env not found. Creating default .env ...
    > ".env" echo PORT=3108
    >> ".env" echo POS_ORIGIN=
    >> ".env" echo AGENT_TOKEN=my_secret
    >> ".env" echo ATOL_DRIVER_USE_SAVED_SETTINGS=true
    >> ".env" echo ATOL_TAXATION_TYPE=patent
    >> ".env" echo ATOL_VAT_TYPE=none
    >> ".env" echo MARKING_STATUS_ATTEMPTS=10
    >> ".env" echo MARKING_STATUS_INTERVAL_MS=1200
)

where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not added to PATH.
    echo Install Node.js LTS, close this window, then run start-agent.bat again.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo ERROR: npm is not available. Reinstall Node.js LTS.
    pause
    exit /b 1
)

echo Node version:
node -v
echo.

echo Installing npm dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed.
    pause
    exit /b 1
)

echo.
echo Starting ATOL local agent...
echo Agent URL: http://127.0.0.1:3108
echo Token: my_secret
echo.
call npm start

echo.
echo Agent stopped.
pause
