@echo off
where node >nul 2>nul || (echo Node.js not found. Please install Node.js and add it to PATH. & pause & exit /b)
cd /d "%~dp0"
echo Cleaning old workbench instances (only processes with server.js)...
wmic process where "name='node.exe' and commandline like '%%server.js%%'" call terminate >nul 2>nul
timeout /t 1 >nul
echo Starting workbench in background (http://localhost:8788)...
powershell -NoProfile -Command "Start-Process -FilePath node.exe -ArgumentList 'server.js' -WorkingDirectory '%~dp0' -WindowStyle Hidden"
if errorlevel 1 (
  echo Failed to start the workbench.
  pause
  exit /b 1
)
echo Workbench is now running in the background: http://localhost:8788
echo To stop it later, run stop.bat.
exit /b 0
