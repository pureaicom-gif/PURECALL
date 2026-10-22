@echo off
cd /d "%~dp0"
if not exist .env copy .env.example .env >nul
if exist runtime\node.exe (
  set "PURE_NODE=%~dp0runtime\node.exe"
) else (
  set "PURE_NODE=node"
)
if not exist node_modules\express (
  echo Installing PURE dependencies...
  call npm.cmd ci --omit=dev
  if errorlevel 1 goto failure
)
echo.
echo Starting PURE. The server address will appear below.
echo Admin UI: http://localhost:3000/admin (ID: PUREFXAI / PASS: Darkpure8)
echo Phone: use this computer's Wi-Fi IP and the server port.
echo Calls require HTTPS. See README.md for public deployment.
echo Keep this window open. Press Ctrl+C to stop.
echo.
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000/admin"
"%PURE_NODE%" --env-file-if-exists=.env server/index.js
if errorlevel 1 goto failure
exit /b 0
:failure
echo PURE could not start. Read the specific error above.
pause
exit /b 1
