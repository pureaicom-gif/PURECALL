@echo off
rem PURE Node launcher (Windows). First time: see docs\PURE-NODE.md
cd /d "%~dp0"
where node >nul 2>nul || (echo ต้องติดตั้ง Node.js 24 ก่อน: https://nodejs.org & pause & exit /b 1)
if not exist node_modules (call npm ci --omit=dev || (pause & exit /b 1))
if "%~1"=="" (node scripts\pure-node.mjs run) else (node scripts\pure-node.mjs %*)
pause
