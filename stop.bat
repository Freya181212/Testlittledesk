@echo off
echo Stopping workbench (only processes with server.js)...
wmic process where "name='node.exe' and commandline like '%%server.js%%'" call terminate >nul 2>nul
echo Done.
pause
