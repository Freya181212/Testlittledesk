@echo off
where node >nul 2>nul || (echo Node.js not found. Please install Node.js and add it to PATH. & pause & exit /b)
cd /d "%~dp0"
node server.js
pause
