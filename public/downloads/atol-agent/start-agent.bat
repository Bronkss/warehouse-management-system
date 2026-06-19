@echo off
title ATOL Local Agent
cd /d "%~dp0"

echo Installing dependencies...
call npm install

echo.
echo Starting ATOL local agent...
call npm start

pause