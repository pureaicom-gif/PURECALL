@echo off
title PURE Admin Console
cd /d "%~dp0"
echo ================================================================
echo           PURE - ADMIN CONSOLE LAUNCHER
echo ================================================================
echo.
echo Opening Admin Console in your browser...
start http://localhost:3000/admin
echo.
echo URL: http://localhost:3000/admin
echo Admin ID: PUREFXAI
echo Password: Darkpure8
echo.
echo If the server is not running, run START-SERVER.cmd or START-ONLINE.cmd first.
timeout /t 3 >nul
exit /b 0
