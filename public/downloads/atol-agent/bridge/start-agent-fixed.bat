@echo off
chcp 65001 >nul
setlocal EnableExtensions
title ATOL Local Agent Driver 10.10

cd /d "%~dp0"

echo ============================================
echo  ATOL Local Agent Driver 10.10
echo ============================================
echo.
echo Папка агента:
echo %CD%
echo.

if not exist "server.js" (
    echo ОШИБКА: рядом со start-agent.bat не найден файл server.js
    echo Скачайте server.js из настроек ККТ и положите его в эту же папку.
    echo.
    pause
    exit /b 1
)

if not exist "package.json" (
    echo ОШИБКА: рядом со start-agent.bat не найден файл package.json
    echo Скачайте package.json из настроек ККТ и положите его в эту же папку.
    echo.
    pause
    exit /b 1
)

if not exist "bridge" (
    echo ОШИБКА: не найдена папка bridge
    echo Создайте папку bridge и положите туда файл atol-json.ps1
    echo.
    pause
    exit /b 1
)

if not exist "bridge\atol-json.ps1" (
    echo ОШИБКА: не найден файл bridge\atol-json.ps1
    echo Скачайте atol-json.ps1 и положите его в папку bridge.
    echo.
    pause
    exit /b 1
)

if not exist ".env" (
    if exist "env.txt" (
        echo Найден env.txt. Переименовываю в .env ...
        ren "env.txt" ".env"
    )
)

if not exist ".env" (
    echo ВНИМАНИЕ: файл .env не найден.
    echo Агент запустится с настройками по умолчанию:
    echo PORT=3108
    echo AGENT_TOKEN=my_secret
    echo.
) else (
    echo Файл .env найден.
    echo.
)

where node >nul 2>nul
if errorlevel 1 (
    echo ОШИБКА: Node.js не установлен или не добавлен в PATH.
    echo Установите Node.js LTS и запустите этот файл заново.
    echo.
    pause
    exit /b 1
)

echo Версия Node.js:
node -v
echo.

if not exist "node_modules" (
    echo Устанавливаю зависимости npm...
    call npm install
    if errorlevel 1 (
        echo.
        echo ОШИБКА: npm install завершился с ошибкой.
        pause
        exit /b 1
    )
    echo.
) else (
    echo Зависимости уже установлены.
    echo.
)

echo Запускаю локальный агент ККТ...
echo Адрес должен быть: http://127.0.0.1:3108
echo Для остановки нажмите Ctrl+C.
echo.

call npm start

echo.
echo Агент остановлен.
pause
